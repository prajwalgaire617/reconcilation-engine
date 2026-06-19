from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional
import logging
from django.utils import timezone

from ..dtos.queue import QueueEntryDTO, QueueListDTO, ExecuteQueueResultDTO, EnqueueCommand
from ..repositories.base import AbstractQueueRepository, AbstractBatchRepository
from ..repositories.payment_repository import QueueRepository, BatchRepository

log = logging.getLogger(__name__)


@dataclass
class EnqueueResult:
    entries: List[QueueEntryDTO]
    total_queued: int


class QueueService:
    """
    QueueService — coordinates payment execution queue scheduling and runs FIFO pipelines.
    """
    def __init__(
        self,
        queue_repo: Optional[AbstractQueueRepository] = None,
        batch_repo: Optional[AbstractBatchRepository] = None,
    ):
        self._queue = queue_repo or QueueRepository()
        self._batch = batch_repo or BatchRepository()

    def enqueue(self, batch_ids: List[int], scheduled_at: datetime) -> EnqueueResult:
        count = self._queue.enqueue_batches(batch_ids, scheduled_at)
        # Fetch newly queued entries to return
        all_entries = self._queue.list_queue()
        # Filter for the ones we just added (based on batch_ids and status QUEUED)
        new_entries = [e for e in all_entries if e.batch_id in batch_ids and e.status == "QUEUED"]
        return EnqueueResult(entries=new_entries, total_queued=count)

    def get_queue(self) -> List[QueueEntryDTO]:
        return self._queue.list_queue()

    def cancel(self, queue_id: int) -> QueueEntryDTO:
        entry = self._queue.get_queue_entry(queue_id)
        if not entry:
            raise ValueError(f"Queue entry {queue_id} not found.")
        if entry.status != "QUEUED":
            raise ValueError(f"Cannot cancel entry in status {entry.status}.")
        self._queue.cancel_entry(queue_id)
        return self._queue.get_queue_entry(queue_id)

    def move(self, queue_id: int, direction: str) -> QueueEntryDTO:
        entry = self._queue.get_queue_entry(queue_id)
        if not entry:
            raise ValueError(f"Queue entry {queue_id} not found.")
        self._queue.move_entry(queue_id, direction)
        return self._queue.get_queue_entry(queue_id)

    def execute_due(self) -> ExecuteQueueResultDTO:
        """Execute all QUEUED entries whose scheduled_at <= now."""
        due = self._queue.get_due_entries()
        executed = skipped = failed = 0
        errors: List[str] = []

        for entry in due:
            try:
                self._execute_entry(entry)
                executed += 1
            except Exception as exc:
                label = f"Queue#{entry.position} batch={entry.batch_number}"
                log.error("[Queue] Execution failed for %s: %s", label, exc)
                errors.append(f"{label}: {exc}")
                skipped += 1
                failed += 1

        return ExecuteQueueResultDTO(executed=executed, skipped=skipped, failed=failed, errors=errors)

    def _execute_entry(self, entry: QueueEntryDTO) -> None:
        """
        Runs the full payment pipeline: Gateway Submission → SOSYS fetch → Auto-Reconciliation.
        """
        from ..adapters.factory import AdapterFactory
        from ..services.reconciliation_service import ReconciliationService

        gw  = AdapterFactory.payment_gateway()
        sys = AdapterFactory.confirmation_system()
        audit = AdapterFactory.logger()

        self._queue.update_queue_status(entry.id, "EXECUTING")

        # Load batch items for submission
        batch_data = self._batch.get_batch_with_items(entry.batch_id)
        if not batch_data:
            raise ValueError(f"Batch data for batch_id={entry.batch_id} not found.")

        items = batch_data["items"]
        gateway_items = [{"claim_id": i["claim_id"], "amount": float(i["amount"])} for i in items]
        claim_ids = [i["claim_id"] for i in items]

        try:
            # Step 1: NCHL payment gateway submission
            gw_result = gw.submit_batch(entry.batch_number, gateway_items)
            audit.log_batch_submitted(entry.batch_number, len(items), gw_result)

            # Update item statuses via BatchRepository
            self._batch.update_items_from_response(entry.batch_id, [
                {"claim_id": r.claim_id, "status": r.status, "gateway_reference": r.gateway_reference}
                for r in gw_result.results
            ])

            # Update batch status
            self._batch.update_batch_status(entry.batch_id, "SUBMITTED")

            # Step 2: Fetch and persist SOSYS confirmations
            sosys_summary = sys.fetch_and_persist(claim_ids)

            # Step 3: Trigger reconciliation (Celery background or sync fallback)
            try:
                from ..tasks.reconciliation_tasks import reconcile_batch_task
                task_result = reconcile_batch_task.delay(
                    claim_ids=claim_ids,
                    batch_number=entry.batch_number,
                )
                recon_note = f"Recon task dispatched (task_id={task_result.id})"
            except Exception:
                recon = ReconciliationService().run(claim_ids=claim_ids)
                audit.log_reconciliation_complete(
                    entry.batch_number,
                    matched=recon.matched,
                    pending=recon.settlement_pending,
                    errors=recon.status_mismatch + recon.investigation_required + recon.amount_mismatch,
                )
                recon_note = (
                    f"Recon: {recon.matched} DONE, {recon.settlement_pending} PENDING, "
                    f"{recon.status_mismatch + recon.investigation_required} ERROR"
                )

            # Update queue status to COMPLETED
            notes = (
                f"NCHL: {len(items)} items | "
                f"SOSYS: {sosys_summary['fetched']}/{len(claim_ids)} confirmed | "
                f"{recon_note}"
            )
            self._queue.update_queue_status(entry.id, "COMPLETED", executed_at=timezone.now(), notes=notes)

        except Exception as exc:
            self._batch.update_batch_status(entry.batch_id, "FAILED")
            self._queue.update_queue_status(entry.id, "FAILED", notes=str(exc)[:400])
            audit.log_error(f"batch={entry.batch_number}", exc)
            raise
