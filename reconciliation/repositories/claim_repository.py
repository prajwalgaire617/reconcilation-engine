"""
Claim repository abstractions.

MockClaimRepository returns hardcoded data for the hackathon demo.
Replace with OpenIMISClaimRepository when integrating with live OpenIMIS models.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from typing import List, Optional


@dataclass
class ClaimDTO:
    claim_id: int
    beneficiary_name: str
    amount: Decimal
    status: str


class AbstractClaimRepository(ABC):
    @abstractmethod
    def get_approved_claims(self) -> List[ClaimDTO]:
        ...

    @abstractmethod
    def get_claim_by_id(self, claim_id: int) -> Optional[ClaimDTO]:
        ...


class MockClaimRepository(AbstractClaimRepository):
    _CLAIMS = [
        ClaimDTO(101, "Ram Bahadur Shrestha", Decimal("5000.00"), "APPROVED"),
        ClaimDTO(102, "Sita Devi Adhikari", Decimal("12500.00"), "APPROVED"),
        ClaimDTO(103, "Hari Prasad Kafle", Decimal("8750.00"), "APPROVED"),
        ClaimDTO(104, "Gita Kumari Thapa", Decimal("3200.00"), "APPROVED"),
        ClaimDTO(105, "Bikash Raj Poudel", Decimal("19000.00"), "APPROVED"),
        ClaimDTO(106, "Sunita Maharjan", Decimal("6400.00"), "APPROVED"),
        ClaimDTO(107, "Nabin Kumar Chaudhary", Decimal("11200.00"), "APPROVED"),
        ClaimDTO(108, "Puja Rai", Decimal("4500.00"), "APPROVED"),
    ]

    def get_approved_claims(self) -> List[ClaimDTO]:
        return [c for c in self._CLAIMS if c.status == "APPROVED"]

    def get_claim_by_id(self, claim_id: int) -> Optional[ClaimDTO]:
        return next((c for c in self._CLAIMS if c.claim_id == claim_id), None)


class OpenIMISClaimRepository(AbstractClaimRepository):
    """
    Reads directly from openIMIS Claim model.
    Wire this in place of MockClaimRepository in production.
    """

    def get_approved_claims(self) -> List[ClaimDTO]:
        from claim.models import Claim  # openimis-be-claim_py
        qs = Claim.objects.filter(status=Claim.STATUS_VALUATED).select_related("insuree")
        return [
            ClaimDTO(
                claim_id=c.id,
                beneficiary_name=str(c.insuree),
                amount=c.approved or Decimal("0"),
                status="APPROVED",
            )
            for c in qs
        ]

    def get_claim_by_id(self, claim_id: int) -> Optional[ClaimDTO]:
        from claim.models import Claim
        try:
            c = Claim.objects.get(pk=claim_id)
            return ClaimDTO(c.id, str(c.insuree), c.approved or Decimal("0"), "APPROVED")
        except Claim.DoesNotExist:
            return None
