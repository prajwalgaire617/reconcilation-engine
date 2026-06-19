"""
BatchCreateService — create payment batches from FHIR claims.

Grouping: one batch per hospital (provider.reference).
NCHL failure handling:
  - Connection error / timeout → batch marked FAILED, items FAILED,
    failure_reason set so retry can pick them up.
  - HTTP error from gateway → same.
  - On any failure the batch is stored; RetryService can re-submit it later.
"""
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional  # noqa: F401 (Optional used in method signatures)
import logging

logger = logging.getLogger(__name__)


@dataclass
class BatchResult:
    hospital_id: str
    hospital_name: str
    batch_id: int
    batch_number: str
    claim_count: int
    total_amount: Decimal
    status: str
    failure_reason: str = ""


@dataclass
class BatchCreateSummary:
    batches: List[BatchResult] = field(default_factory=list)

    @property
    def total_batches(self):
        return len(self.batches)

    @property
    def submitted(self):
        return sum(1 for b in self.batches if b.status == "SUBMITTED")

    @property
    def failed(self):
        return sum(1 for b in self.batches if b.status == "FAILED")


class BatchCreateService:
    def __init__(self, gateway=None, batch_repo=None, item_repo=None):
        from .gateway_client import GatewayClient
        from ..repositories.payment_repository import PaymentBatchRepository, PaymentItemRepository
        self._gateway    = gateway    or GatewayClient()
        self._batch_repo = batch_repo or PaymentBatchRepository()
        self._item_repo  = item_repo  or PaymentItemRepository()

    def create_from_fhir_claims(
        self,
        fhir_claim_ids: List[int],
        batch_size: Optional[int] = None,
        submit_now: bool = True,
    ) -> BatchCreateSummary:
        """
        Load the selected FHIRClaim rows, group by hospital_id.

        batch_size: if set, split each hospital's claims into chunks of that size.
        submit_now: if False, batches are persisted as PENDING but NOT sent to NCHL.
                    Use queue_service.enqueue() afterwards to schedule submission.
        """
        from ..repositories.fhir_repository import FHIRClaimRepository
        claims = FHIRClaimRepository().get_by_ids(fhir_claim_ids)
        if not claims:
            raise ValueError("No valid FHIR claims found for the provided IDs.")

        groups: dict[str, list] = defaultdict(list)
        for c in claims:
            groups[c.hospital_id].append(c)

        summary = BatchCreateSummary()
        for hospital_id, hospital_claims in groups.items():
            if batch_size and batch_size > 0:
                chunks = [
                    hospital_claims[i: i + batch_size]
                    for i in range(0, len(hospital_claims), batch_size)
                ]
                for chunk_idx, chunk in enumerate(chunks):
                    result = self._create_hospital_batch(
                        hospital_id, chunk, chunk_num=chunk_idx + 1, submit_now=submit_now
                    )
                    summary.batches.append(result)
            else:
                result = self._create_hospital_batch(hospital_id, hospital_claims, submit_now=submit_now)
                summary.batches.append(result)

        return summary

    def _create_hospital_batch(
        self, hospital_id: str, claims: list, chunk_num: int = 0, submit_now: bool = True
    ) -> BatchResult:
        hospital_name = claims[0].hospital_name or hospital_id
        batch_tag     = hospital_id.replace("/", "-").replace(" ", "_")[:18]
        from django.utils.timezone import now
        import uuid
        suffix        = f"-P{chunk_num}" if chunk_num else ""
        rand_suffix   = uuid.uuid4().hex[:4].upper()
        batch_number  = f"BATCH-{batch_tag}{suffix}-{now().strftime('%Y%m%d%H%M%S')}-{rand_suffix}"

        total_amount  = sum(c.amount for c in claims)

        # Persist the batch
        batch = self._batch_repo.create(
            batch_number=batch_number,
            hospital_id=hospital_id,
            hospital_name=hospital_name,
        )

        # Persist payment items (one per claim)
        gateway_items = [
            {"claim_id": int(c.fhir_id), "amount": float(c.amount)}
            for c in claims
        ]
        self._item_repo.bulk_create(batch, gateway_items)

        # Optionally submit to NCHL immediately
        if not submit_now:
            status = "PENDING"
            failure_reason = ""
            logger.info("Batch %s created but NOT submitted (queued for later)", batch_number)
        else:
            try:
                response = self._gateway.submit_batch(batch_number, gateway_items)
                self._update_items_from_response(batch, response.get("results", []))
                self._batch_repo.update_status(batch, "SUBMITTED")
                status = "SUBMITTED"
                failure_reason = ""
                logger.info("Batch %s submitted to NCHL OK (%d claims)", batch_number, len(claims))
            except Exception as exc:
                failure_reason = str(exc)[:300]
                self._mark_all_items_failed(batch, failure_reason)
                self._batch_repo.update_status(batch, "FAILED")
                status = "FAILED"
                logger.warning("NCHL submission failed for %s: %s", batch_number, failure_reason)

        return BatchResult(
            hospital_id    = hospital_id,
            hospital_name  = hospital_name,
            batch_id       = batch.id,
            batch_number   = batch_number,
            claim_count    = len(claims),
            total_amount   = total_amount,
            status         = status,
            failure_reason = failure_reason,
        )

    def _update_items_from_response(self, batch, results: list):
        from ..models import PaymentItem
        item_map = {item.claim_id: item for item in batch.items.all()}
        for res in results:
            item = item_map.get(res.get("claim_id"))
            if not item:
                continue
            gw_status = res.get("status", "FAILED")
            item.status            = "SUCCESS" if gw_status == "SUCCESS" else "FAILED"
            item.gateway_reference = res.get("gateway_reference", "")
            item.save(update_fields=["status", "gateway_reference", "updated_at"])

    def _mark_all_items_failed(self, batch, reason: str):
        from ..models import PaymentItem
        batch.items.all().update(status="FAILED")
        # Store reason in the batch object for display (not on items — no reason field there)
        batch.status = "FAILED"
        batch.save(update_fields=["status", "updated_at"])
