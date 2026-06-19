import requests
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import List, Optional
from django.conf import settings
from ..dtos.claim import FHIRClaimDTO

FHIR_BASE = getattr(settings, "FHIR_BASE_URL", "https://hapi.fhir.org/baseR4")
FETCH_TIMEOUT = 15
PAGE_SIZE = 50


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
