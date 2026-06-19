"""
ClaimService — orchestrates FHIR sync and claim listing.

Responsibilities:
  - Trigger FHIR fetch via FHIRApiClient (HTTP side-effect)
  - Persist fetched DTOs via ClaimRepository (ORM side-effect)
  - Compute 4-tier payment status for each claim
  - Return typed Output DTOs to views

Why this service exists:
  FHIRClaimListView previously contained 60+ lines of filtering, status
  computation, and pagination. That logic can't be tested without an HTTP
  request. Moving it here means tests can call the service with a fake
  repository and never touch the network or database.
"""
import logging
from typing import List, Optional

from ..dtos.claim import (
    ClaimListQuery, ClaimPageDTO, ClaimListItemDTO,
    FetchClaimsCommand, FHIRSyncResultDTO, HospitalDTO,
)
from ..repositories.base import AbstractClaimRepository, AbstractReconciliationRepository
from ..repositories.claim_repository import ClaimRepository
from ..repositories.reconciliation_repository import ReconciliationRepository

log = logging.getLogger(__name__)

_PAYMENT_STATUSES = {"PENDING", "DONE", "ERROR", "BATCHED", "SUBMITTED"}
_DONE_RESULTS     = {"MATCHED"}
_PENDING_RESULTS  = {"SETTLEMENT_PENDING"}
_ERROR_RESULTS    = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}


class ClaimService:
    """
    Dependency injection: default args wire the real ORM repos.
    Tests pass stub repos without touching the database.
    """

    def __init__(
        self,
        claim_repo: Optional[AbstractClaimRepository] = None,
        recon_repo: Optional[AbstractReconciliationRepository] = None,
    ):
        self._claims = claim_repo or ClaimRepository()
        self._recon  = recon_repo or ReconciliationRepository()

    # ── FHIR sync ─────────────────────────────────────────────────────────────

    def sync_fhir(self, cmd: FetchClaimsCommand) -> FHIRSyncResultDTO:
        """
        Fetch claims from the external FHIR server and upsert into local cache.
        Called from: POST /claims/fetch  AND  the nightly Celery fhir_sync_task.
        """
        from ..services.fhir_client import FHIRApiClient
        dtos = FHIRApiClient().fetch_claims(months=cmd.months)  # raises ConnectionError on failure
        result = self._claims.upsert_all(dtos)
        log.info(
            "[ClaimService] FHIR sync: fetched=%d created=%d updated=%d skipped=%d",
            len(dtos), result["created"], result["updated"], result["skipped"],
        )
        return FHIRSyncResultDTO(
            fetched=len(dtos),
            created=result["created"],
            updated=result["updated"],
            skipped=result["skipped"],
        )

    # ── Claim listing ─────────────────────────────────────────────────────────

    def list_claims(self, query: ClaimListQuery) -> ClaimPageDTO:
        """
        Return a paginated, payment-status-annotated list of FHIR claims.
        The payment_status is computed from ReconciliationRecord + PaymentItem
        using a 4-tier precedence rule (see _compute_payment_status).
        """
        fhir_status = None if query.status in _PAYMENT_STATUSES else query.status

        raw_claims = self._claims.list_claims(
            hospital_id=query.hospital_id,
            fhir_status=fhir_status,
            months=query.months,
        )

        numeric_ids = {}
        for c in raw_claims:
            try:
                numeric_ids[int(c["fhir_id"])] = c["id"]
            except (ValueError, TypeError):
                pass

        ps_map = self._compute_payment_status(list(numeric_ids.keys())) if numeric_ids else {}

        items: List[ClaimListItemDTO] = []
        for c in raw_claims:
            try:
                ps = ps_map.get(int(c["fhir_id"]), "PENDING")
            except (ValueError, TypeError):
                ps = "PENDING"
            items.append(ClaimListItemDTO(
                id=c["id"],
                fhir_id=c["fhir_id"],
                claim_reference=c["claim_reference"],
                patient_name=c["patient_name"],
                hospital_id=c["hospital_id"],
                hospital_name=c["hospital_name"],
                amount=c["amount"],
                currency=c["currency"],
                fhir_status=c["fhir_status"],
                service_date=c["service_date"],
                last_synced=c["last_synced"],
                payment_status=ps,
            ))

        # Filter by payment_status after annotation (no DB index for this derived field)
        effective_ps_filter = query.payment_status or (
            query.status if query.status in _PAYMENT_STATUSES else None
        )
        if effective_ps_filter:
            items = [i for i in items if i.payment_status == effective_ps_filter]

        total = len(items)
        page_size   = max(1, min(query.page_size, 200))
        total_pages = max(1, (total + page_size - 1) // page_size)
        page        = max(1, min(query.page, total_pages))
        start       = (page - 1) * page_size

        return ClaimPageDTO(
            claims=items[start: start + page_size],
            count=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            last_sync=self._claims.last_sync(),
        )

    def list_hospitals(self) -> List[HospitalDTO]:
        return self._claims.hospitals()

    # ── Internal: 4-tier payment status computation ───────────────────────────

    def _compute_payment_status(self, claim_ids: list) -> dict:
        """
        4-tier status derivation — business logic that lives in the service layer.

        Tier 1 (ReconciliationRecord — most authoritative):
          MATCHED            → DONE
          SETTLEMENT_PENDING → PENDING
          error results      → ERROR

        Tier 2 (PaymentItem.status — gateway result):
          SUCCESS  → SUBMITTED
          FAILED   → ERROR
          PENDING  → BATCHED (in a batch, not yet executed)

        Tier 3 (default):
          No PaymentItem at all → PENDING (not batched yet)
        """
        recon_map = self._recon.get_status_map(claim_ids)
        item_map  = self._recon.get_item_status_map(claim_ids)

        out = {}
        for cid in claim_ids:
            recon = recon_map.get(cid)
            if recon in _DONE_RESULTS:
                out[cid] = "DONE"
            elif recon in _PENDING_RESULTS:
                out[cid] = "PENDING"
            elif recon in _ERROR_RESULTS:
                out[cid] = "ERROR"
            else:
                item_st = item_map.get(cid)
                if item_st == "FAILED":   out[cid] = "ERROR"
                elif item_st == "SUCCESS": out[cid] = "SUBMITTED"
                elif item_st == "PENDING": out[cid] = "BATCHED"
                else:                      out[cid] = "PENDING"
        return out


# ── Legacy shim — kept so existing openIMIS integration code doesn't break ────
from ..repositories.claim_repository import AbstractLegacyClaimRepository, ClaimDTO, MockClaimRepository


class LegacyClaimService:
    """Original claim service that read from MockClaimRepository / openIMIS models."""
    def __init__(self, repo: AbstractLegacyClaimRepository = None):
        self._repo = repo or MockClaimRepository()

    def get_approved_claims(self):
        return self._repo.get_approved_claims()

    def get_claim(self, claim_id: int) -> ClaimDTO:
        claim = self._repo.get_claim_by_id(claim_id)
        if not claim:
            raise ValueError(f"Claim {claim_id} not found")
        return claim
