"""
Claim repository — Django ORM implementation of AbstractClaimRepository.

This is the ONLY file allowed to import and query FHIRClaim.
All callers (services) work through AbstractClaimRepository from base.py.

The legacy MockClaimRepository / OpenIMISClaimRepository stubs are kept below
for backwards compatibility with any openIMIS integration code.
"""
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from .base import AbstractClaimRepository
from ..dtos.claim import FHIRClaimDTO, HospitalDTO


class ClaimRepository(AbstractClaimRepository):
    """
    Concrete repository: reads/writes the local fhir_claims table.
    Services call this class; they never import Django models directly.
    """

    def upsert_all(self, dtos: List[FHIRClaimDTO]) -> Dict[str, int]:
        from ..models import FHIRClaim
        created = updated = skipped = 0
        for dto in dtos:
            if dto.amount <= 0:
                skipped += 1
                continue
            _, was_created = FHIRClaim.objects.update_or_create(
                fhir_id=dto.fhir_id,
                defaults=dict(
                    claim_reference=dto.claim_reference,
                    patient_name=dto.patient_name,
                    patient_ref=dto.patient_ref,
                    hospital_id=dto.hospital_id,
                    hospital_name=dto.hospital_name,
                    amount=dto.amount,
                    currency=dto.currency,
                    fhir_status=dto.fhir_status,
                    service_date=dto.service_date,
                ),
            )
            if was_created:
                created += 1
            else:
                updated += 1
        return {"created": created, "updated": updated, "skipped": skipped}

    def _to_dto(self, obj) -> FHIRClaimDTO:
        return FHIRClaimDTO(
            id=obj.id,
            fhir_id=obj.fhir_id,
            claim_reference=obj.claim_reference,
            patient_name=obj.patient_name,
            patient_ref=obj.patient_ref,
            hospital_id=obj.hospital_id,
            hospital_name=obj.hospital_name,
            amount=obj.amount,
            currency=obj.currency,
            fhir_status=obj.fhir_status,
            service_date=obj.service_date,
            last_synced=obj.last_synced,
        )

    def list_claims(
        self,
        hospital_id: Optional[str] = None,
        fhir_status: Optional[str] = None,
        months: Optional[int] = None,
    ) -> List[FHIRClaimDTO]:
        from ..models import FHIRClaim
        qs = FHIRClaim.objects.all()
        if hospital_id:
            qs = qs.filter(hospital_id=hospital_id)
        if fhir_status:
            qs = qs.filter(fhir_status=fhir_status)
        if months:
            since = date.today() - timedelta(days=months * 30)
            qs = qs.filter(service_date__gte=since)
        return [self._to_dto(obj) for obj in qs]

    def get_by_ids(self, ids: List[int]) -> List[FHIRClaimDTO]:
        from ..models import FHIRClaim
        qs = FHIRClaim.objects.filter(id__in=ids)
        return [self._to_dto(obj) for obj in qs]

    def get_by_fhir_ids(self, fhir_ids: List[str]) -> List[FHIRClaimDTO]:
        from ..models import FHIRClaim
        qs = FHIRClaim.objects.filter(fhir_id__in=fhir_ids)
        return [self._to_dto(obj) for obj in qs]

    def hospitals(self) -> List[HospitalDTO]:
        from ..models import FHIRClaim
        from django.db.models import Count, Sum
        rows = (
            FHIRClaim.objects
            .values("hospital_id", "hospital_name")
            .annotate(claim_count=Count("id"), total_amount=Sum("amount"))
            .order_by("hospital_name")
        )
        seen: Dict[str, HospitalDTO] = {}
        for r in rows:
            hid = r["hospital_id"]
            if hid not in seen:
                seen[hid] = HospitalDTO(
                    hospital_id=hid,
                    hospital_name=r["hospital_name"],
                    claim_count=r["claim_count"],
                    total_amount=r["total_amount"] or Decimal("0"),
                )
        return list(seen.values())

    def last_sync(self) -> Optional[datetime]:
        from ..models import FHIRClaim
        obj = FHIRClaim.objects.order_by("-last_synced").first()
        return obj.last_synced if obj else None


# ── Legacy stubs (kept for openIMIS integration compatibility) ────────────────

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ClaimDTO:
    claim_id: int
    beneficiary_name: str
    amount: Decimal
    status: str


class AbstractLegacyClaimRepository(ABC):
    @abstractmethod
    def get_approved_claims(self) -> List[ClaimDTO]: ...

    @abstractmethod
    def get_claim_by_id(self, claim_id: int) -> Optional[ClaimDTO]: ...


class MockClaimRepository(AbstractLegacyClaimRepository):
    _CLAIMS = [
        ClaimDTO(101, "Ram Bahadur Shrestha", Decimal("5000.00"), "APPROVED"),
        ClaimDTO(102, "Sita Devi Adhikari", Decimal("12500.00"), "APPROVED"),
        ClaimDTO(103, "Hari Prasad Kafle", Decimal("8750.00"), "APPROVED"),
        ClaimDTO(104, "Gita Kumari Thapa", Decimal("3200.00"), "APPROVED"),
        ClaimDTO(105, "Bikash Raj Poudel", Decimal("19000.00"), "APPROVED"),
    ]

    def get_approved_claims(self) -> List[ClaimDTO]:
        return [c for c in self._CLAIMS if c.status == "APPROVED"]

    def get_claim_by_id(self, claim_id: int) -> Optional[ClaimDTO]:
        return next((c for c in self._CLAIMS if c.claim_id == claim_id), None)


class OpenIMISClaimRepository(AbstractLegacyClaimRepository):
    """Wire this in place of MockClaimRepository when integrating live openIMIS."""

    def get_approved_claims(self) -> List[ClaimDTO]:
        from claim.models import Claim  # openimis-be-claim_py
        return [
            ClaimDTO(c.id, str(c.insuree), c.approved or Decimal("0"), "APPROVED")
            for c in Claim.objects.filter(status=Claim.STATUS_VALUATED).select_related("insuree")
        ]

    def get_claim_by_id(self, claim_id: int) -> Optional[ClaimDTO]:
        from claim.models import Claim
        try:
            c = Claim.objects.get(pk=claim_id)
            return ClaimDTO(c.id, str(c.insuree), c.approved or Decimal("0"), "APPROVED")
        except Claim.DoesNotExist:
            return None
