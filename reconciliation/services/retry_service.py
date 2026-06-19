"""
Retry Batch Service.

Finds all FAILED PaymentItems in a batch and creates a new linked batch
containing only those items for re-submission.
"""
import uuid
from dataclasses import dataclass
from typing import List

from ..models import PaymentBatch, PaymentItem
from ..repositories.payment_repository import PaymentBatchRepository, PaymentItemRepository
from .gateway_client import GatewayClient


@dataclass
class RetryResult:
    retry_batch_id: int
    retry_batch_number: str
    retried_claim_ids: List[int]


class RetryService:
    def __init__(
        self,
        batch_repo: PaymentBatchRepository = None,
        item_repo: PaymentItemRepository = None,
        gateway: GatewayClient = None,
    ):
        self._batch_repo = batch_repo or PaymentBatchRepository()
        self._item_repo = item_repo or PaymentItemRepository()
        self._gateway = gateway or GatewayClient()

    def create_retry_batch(self, original_batch_id: int) -> RetryResult:
        original = self._batch_repo.get_by_id(original_batch_id)
        if not original:
            raise ValueError(f"Batch {original_batch_id} not found.")

        failed_items = list(original.items.filter(status="FAILED"))
        if not failed_items:
            raise ValueError(f"Batch {original_batch_id} has no failed items to retry.")

        retry_count = (original.retry_count or 0) + 1
        retry_batch_number = f"{original.batch_number}-RETRY-{retry_count}"

        retry_batch = self._batch_repo.create(
            batch_number=retry_batch_number,
            parent_batch_id=original.id,
            retry_count=retry_count,
        )

        gateway_items = [
            {"claim_id": item.claim_id, "amount": float(item.amount)}
            for item in failed_items
        ]

        self._item_repo.bulk_create(retry_batch, gateway_items)

        try:
            response = self._gateway.submit_batch(retry_batch_number, gateway_items)
            self._update_items_from_gateway(retry_batch, response.get("results", []))
            self._batch_repo.update_status(retry_batch, "SUBMITTED")
        except Exception:
            self._batch_repo.update_status(retry_batch, "PENDING")

        return RetryResult(
            retry_batch_id=retry_batch.id,
            retry_batch_number=retry_batch_number,
            retried_claim_ids=[item.claim_id for item in failed_items],
        )

    def _update_items_from_gateway(self, batch: PaymentBatch, results: list) -> None:
        item_map = {item.claim_id: item for item in batch.items.all()}
        for res in results:
            item = item_map.get(res["claim_id"])
            if item:
                status = "SUCCESS" if res.get("status") == "SUCCESS" else "FAILED"
                self._item_repo.update_item(item, status, res.get("gateway_reference", ""))
