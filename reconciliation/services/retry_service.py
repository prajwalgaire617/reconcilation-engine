from dataclasses import dataclass
from typing import List, Optional
import logging

from ..repositories.base import AbstractBatchRepository
from ..repositories.payment_repository import BatchRepository
from .gateway_client import GatewayClient

logger = logging.getLogger(__name__)


@dataclass
class RetryResult:
    retry_batch_id: int
    retry_batch_number: str
    retried_claim_ids: List[int]

    def to_dict(self) -> dict:
        return {
            "retry_batch_id": self.retry_batch_id,
            "retry_batch_number": self.retry_batch_number,
            "retried_claim_ids": self.retried_claim_ids,
        }


class RetryService:
    """
    RetryService — handles retrying failed payments in a batch by submitting a new retry batch.
    """
    def __init__(
        self,
        batch_repo: Optional[AbstractBatchRepository] = None,
        gateway=None,
    ):
        self._batch_repo = batch_repo or BatchRepository()
        self._gateway    = gateway    or GatewayClient()

    def create_retry_batch(self, original_batch_id: int) -> RetryResult:
        # Resolve batch details using Repository
        original = self._batch_repo.get_batch_detail(original_batch_id)
        if not original:
            raise ValueError(f"Batch {original_batch_id} not found.")

        # Find failed items
        failed_items = [item for item in original.items if item.status == "FAILED"]
        if not failed_items:
            raise ValueError(f"Batch {original_batch_id} has no failed items to retry.")

        retry_count = (original.retry_count or 0) + 1
        retry_batch_number = f"{original.batch_number}-RETRY-{retry_count}"

        # Create new retry batch via Repository
        retry_batch_id = self._batch_repo.create_batch(
            batch_number=retry_batch_number,
            parent_batch_id=original.id,
            retry_count=retry_count,
            hospital_id=original.hospital_id,
            hospital_name=original.hospital_name,
        )

        gateway_items = [
            {"claim_id": item.claim_id, "amount": float(item.amount)}
            for item in failed_items
        ]

        # Bulk create items for the retry batch
        self._batch_repo.bulk_create_items(retry_batch_id, gateway_items)

        try:
            response = self._gateway.submit_batch(retry_batch_number, gateway_items)
            self._batch_repo.update_items_from_response(retry_batch_id, response.get("results", []))
            self._batch_repo.update_batch_status(retry_batch_id, "SUBMITTED")
        except Exception as exc:
            logger.warning("Gateway submission failed for retry batch %s: %s", retry_batch_number, exc)
            self._batch_repo.update_batch_status(retry_batch_id, "PENDING")

        return RetryResult(
            retry_batch_id=retry_batch_id,
            retry_batch_number=retry_batch_number,
            retried_claim_ids=[item.claim_id for item in failed_items],
        )

    def retry(self, batch_id: int) -> dict:
        """
        Public entry point called by the background Celery task.
        """
        result = self.create_retry_batch(batch_id)
        return result.to_dict()
