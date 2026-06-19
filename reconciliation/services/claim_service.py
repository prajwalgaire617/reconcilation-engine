from typing import List
from ..repositories.claim_repository import AbstractClaimRepository, ClaimDTO, MockClaimRepository


class ClaimService:
    def __init__(self, repo: AbstractClaimRepository = None):
        self._repo = repo or MockClaimRepository()

    def get_approved_claims(self) -> List[ClaimDTO]:
        return self._repo.get_approved_claims()

    def get_claim(self, claim_id: int) -> ClaimDTO:
        claim = self._repo.get_claim_by_id(claim_id)
        if not claim:
            raise ValueError(f"Claim {claim_id} not found")
        return claim
