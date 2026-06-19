from collections import defaultdict
from decimal import Decimal
from typing import List, Optional
import uuid
import logging
from django.utils.timezone import now

from ..dtos.batch import CreateBatchCommand, AutoCreateBatchCommand, BatchCreateResultDTO, BatchCreateResultDetailDTO
from ..repositories.base import AbstractBatchRepository, AbstractClaimRepository
from ..repositories.payment_repository import BatchRepository
from ..repositories.claim_repository import ClaimRepository
from .gateway_client import GatewayClient

logger = logging.getLogger(__name__)


class BatchCreateService:
    """
    BatchCreateService — orchestrator for payment batch creation.
    """
    def __init__(
        self,
        gateway=None,
        batch_repo: Optional[AbstractBatchRepository] = None,
        claim_repo: Optional[AbstractClaimRepository] = None,
    ):
        self._gateway    = gateway    or GatewayClient()
        self._batch_repo = batch_repo or BatchRepository()
        self._claims     = claim_repo or ClaimRepository()

    def create_batch(self, cmd: CreateBatchCommand) -> BatchCreateResultDTO:
        """
        Load the selected claims, group by hospital_id, and create payment batches.
        """
        claims = self._claims.get_by_ids(cmd.claim_ids)
        if not claims:
            raise ValueError("No valid FHIR claims found for the provided IDs.")

        groups = defaultdict(list)
        for c in claims:
            groups[c.hospital_id].append(c)

        batch_details = []
        for hospital_id, hospital_claims in groups.items():
            if cmd.batch_size and cmd.batch_size > 0:
                chunks = [
                    hospital_claims[i: i + cmd.batch_size]
                    for i in range(0, len(hospital_claims), cmd.batch_size)
                ]
                for chunk_idx, chunk in enumerate(chunks):
                    result = self._create_hospital_batch(
                        hospital_id, chunk, chunk_num=chunk_idx + 1, submit_now=cmd.submit_now
                    )
                    batch_details.append(result)
            else:
                result = self._create_hospital_batch(hospital_id, hospital_claims, submit_now=cmd.submit_now)
                batch_details.append(result)

        return BatchCreateResultDTO(
            batches_created=len(batch_details),
            claims_batched=sum(b.claim_count for b in batch_details),
            batch_numbers=[b.batch_number for b in batch_details],
            submitted=cmd.submit_now,
            batches=batch_details,
        )

    def _create_hospital_batch(
        self, hospital_id: str, claims: list, chunk_num: int = 0, submit_now: bool = True
    ) -> BatchCreateResultDetailDTO:
        hospital_name = claims[0].hospital_name or hospital_id
        batch_tag     = hospital_id.replace("/", "-").replace(" ", "_")[:18]
        suffix        = f"-P{chunk_num}" if chunk_num else ""
        rand_suffix   = uuid.uuid4().hex[:4].upper()
        batch_number  = f"BATCH-{batch_tag}{suffix}-{now().strftime('%Y%m%d%H%M%S')}-{rand_suffix}"

        total_amount  = sum(c.amount for c in claims)

        # Persist batch using Repository
        batch_id = self._batch_repo.create_batch(
            batch_number=batch_number,
            hospital_id=hospital_id,
            hospital_name=hospital_name,
        )

        # Persist payment items via Repository
        gateway_items = [
            {"claim_id": int(c.fhir_id), "amount": float(c.amount)}
            for c in claims
        ]
        self._batch_repo.bulk_create_items(batch_id, gateway_items)

        failure_reason = ""
        if not submit_now:
            status = "PENDING"
            logger.info("Batch %s created but NOT submitted (queued for later)", batch_number)
        else:
            try:
                response = self._gateway.submit_batch(batch_number, gateway_items)
                self._batch_repo.update_items_from_response(batch_id, response.get("results", []))
                self._batch_repo.update_batch_status(batch_id, "SUBMITTED")
                status = "SUBMITTED"
                logger.info("Batch %s submitted to NCHL OK (%d claims)", batch_number, len(claims))
            except Exception as exc:
                failure_reason = str(exc)[:300]
                self._batch_repo.mark_all_items_failed(batch_id)
                self._batch_repo.update_batch_status(batch_id, "FAILED")
                status = "FAILED"
                logger.warning("NCHL submission failed for %s: %s", batch_number, failure_reason)

        return BatchCreateResultDetailDTO(
            hospital_id    = hospital_id,
            hospital_name  = hospital_name,
            batch_id       = batch_id,
            batch_number   = batch_number,
            claim_count    = len(claims),
            total_amount   = total_amount,
            status         = status,
            failure_reason = failure_reason,
        )

    # ── Legacy shim method for backwards compatibility ─────────────────────────
    def create_from_fhir_claims(
        self,
        fhir_claim_ids: List[int],
        batch_size: Optional[int] = None,
        submit_now: bool = True,
    ) -> BatchCreateResultDTO:
        cmd = CreateBatchCommand(
            claim_ids=fhir_claim_ids,
            batch_size=batch_size,
            submit_now=submit_now,
        )
        return self.create_batch(cmd)
