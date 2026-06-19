"""
FHIR R4 claim fetcher and local cache repository.

Fetch strategy: nightly batch pull, not on-demand.
  - External FHIR server is slow/unreliable for peak-hour requests.
  - Run via: python manage.py fetch_fhir_claims --months 3
  - Or trigger manually via POST /api/v1/claims/fetch
"""
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import List, Optional
import requests
from django.utils import timezone

FHIR_BASE = "https://hapi.fhir.org/baseR4"
FETCH_TIMEOUT = 15
PAGE_SIZE = 50


@dataclass
class FHIRClaimDTO:
    fhir_id: str
    claim_reference: str
    patient_name: str
    patient_ref: str
    hospital_id: str
    hospital_name: str
    amount: Decimal
    currency: str
    fhir_status: str
    service_date: Optional[date]


class FHIRApiClient:
    """HTTP client for the FHIR R4 Claim endpoint. Handles pagination."""

    def fetch_claims(self, months: int = 3) -> List[FHIRClaimDTO]:
        since = (date.today() - timedelta(days=months * 30)).isoformat()
        url = (
            f"{FHIR_BASE}/Claim"
            f"?_lastUpdated=gt{since}"
            f"&_count={PAGE_SIZE}"
            f"&_format=json"
        )
        results: List[FHIRClaimDTO] = []
        page = 0
        while url and page < 20:          # cap at 20 pages = 1000 claims max
            try:
                resp = requests.get(url, timeout=FETCH_TIMEOUT)
                resp.raise_for_status()
            except requests.RequestException as exc:
                raise ConnectionError(f"FHIR fetch failed (page {page}): {exc}") from exc

            bundle = resp.json()
            for entry in bundle.get("entry", []):
                dto = self._parse_resource(entry.get("resource", {}))
                if dto:
                    results.append(dto)

            url = self._next_link(bundle)
            page += 1

        return results

    def _parse_resource(self, res: dict) -> Optional[FHIRClaimDTO]:
        fhir_id = res.get("id", "")
        if not fhir_id:
            return None

        patient     = res.get("patient", {})
        provider    = res.get("provider", {})
        hospital_id = provider.get("reference", "Organization/unknown")
        amount      = self._extract_amount(res)
        svc_date    = self._extract_date(res)

        return FHIRClaimDTO(
            fhir_id         = str(fhir_id),
            claim_reference = f"Claim/{fhir_id}",
            patient_name    = patient.get("display", ""),
            patient_ref     = patient.get("reference", ""),
            hospital_id     = hospital_id,
            hospital_name   = provider.get("display", hospital_id),
            amount          = amount,
            currency        = "NPR",
            fhir_status     = res.get("status", "active"),
            service_date    = svc_date,
        )

    def _extract_amount(self, res: dict) -> Decimal:
        # Prefer top-level total; fall back to sum of item[].net.value
        total = res.get("total", {}) or {}
        if total.get("value") is not None:
            try:
                return Decimal(str(total["value"])).quantize(Decimal("0.01"))
            except InvalidOperation:
                pass
        total_val = Decimal("0")
        for item in res.get("item", []):
            net = (item.get("net") or {}).get("value")
            if net is not None:
                try:
                    total_val += Decimal(str(net))
                except InvalidOperation:
                    pass
        return total_val.quantize(Decimal("0.01"))

    def _extract_date(self, res: dict) -> Optional[date]:
        raw = res.get("created", "") or ""
        if raw:
            try:
                return date.fromisoformat(raw[:10])
            except ValueError:
                pass
        for item in res.get("item", []):
            period = item.get("servicedPeriod", {}) or {}
            start = period.get("start", "")
            if start:
                try:
                    return date.fromisoformat(start[:10])
                except ValueError:
                    pass
        return None

    def _next_link(self, bundle: dict) -> Optional[str]:
        for link in bundle.get("link", []):
            if link.get("relation") == "next":
                return link["url"]
        return None


class FHIRClaimRepository:
    """Upserts FHIRClaimDTOs into the local fhir_claims table."""

    def upsert_all(self, dtos: List[FHIRClaimDTO]) -> dict:
        from ..models import FHIRClaim
        created = updated = skipped = 0
        for dto in dtos:
            if dto.amount <= 0:
                skipped += 1
                continue
            obj, was_created = FHIRClaim.objects.update_or_create(
                fhir_id=dto.fhir_id,
                defaults=dict(
                    claim_reference = dto.claim_reference,
                    patient_name    = dto.patient_name,
                    patient_ref     = dto.patient_ref,
                    hospital_id     = dto.hospital_id,
                    hospital_name   = dto.hospital_name,
                    amount          = dto.amount,
                    currency        = dto.currency,
                    fhir_status     = dto.fhir_status,
                    service_date    = dto.service_date,
                ),
            )
            if was_created:
                created += 1
            else:
                updated += 1
        return {"created": created, "updated": updated, "skipped": skipped}

    def list_claims(self, hospital_id=None, status=None, months=None):
        from ..models import FHIRClaim
        qs = FHIRClaim.objects.all()
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        if status:
            qs = qs.filter(fhir_status=status)
        if months:
            since = date.today() - timedelta(days=months * 30)
            qs = qs.filter(service_date__gte=since)
        return qs

    def hospitals(self):
        from ..models import FHIRClaim
        from django.db.models import Sum, Count
        return (
            FHIRClaim.objects
            .values("hospital_id", "hospital_name")
            .annotate(claim_count=Count("id"), total_amount=Sum("amount"))
            .order_by("hospital_name")
        )

    def get_by_ids(self, ids: List[int]):
        from ..models import FHIRClaim
        return list(FHIRClaim.objects.filter(id__in=ids))

    def last_sync(self):
        from ..models import FHIRClaim
        obj = FHIRClaim.objects.order_by("-last_synced").first()
        return obj.last_synced if obj else None
