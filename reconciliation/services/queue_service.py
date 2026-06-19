"""
Payment Queue Service — FIFO batch execution scheduler.

Architecture:
  - Uses AdapterFactory for gateway/SOSYS (Dependency Inversion)
  - Each entry goes through: PENDING → EXECUTING → COMPLETED | FAILED
  - execute_due() is idempotent — safe to call repeatedly
  - After gateway: auto-fetches SOSYS, auto-reconciles (full pipeline in one call)
"""
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import List

from django.db import transaction
from django.utils import timezone

from ..models import PaymentBatch, PaymentQueue, QueueStatus

log = logging.getLogger(__name__)


@dataclass
class EnqueueResult:
    entries: list
    total_queued: int


@dataclass
class ExecuteResult:
    executed: int
    skipped: int
    failed: int
    errors: List[str]


class QueueService:
    # ── Queue management ──────────────────────────────────────────────────────

    def enqueue(self, batch_ids: List[int], scheduled_at: datetime) -> EnqueueResult:
        with transaction.atomic():
            last = PaymentQueue.objects.order_by("-position").first()
            next_pos = (last.position + 1) if last else 1
            entries = []
            for bid in batch_ids:
                try:
                    batch = PaymentBatch.objects.get(pk=bid)
                except PaymentBatch.DoesNotExist:
                    log.warning("Batch %d not found — skipping enqueue", bid)
                    continue
                if hasattr(batch, "queue_entry"):
                    log.debug("Batch %d already in queue — skipping", bid)
                    continue
                q = PaymentQueue.objects.create(
                    batch=batch,
                    position=next_pos,
                    scheduled_at=scheduled_at,
                )
                entries.append(q)
                next_pos += 1
        return EnqueueResult(entries=entries, total_queued=len(entries))

    def get_queue(self):
        return PaymentQueue.objects.select_related("batch").all()

    def cancel(self, queue_id: int) -> PaymentQueue:
        entry = PaymentQueue.objects.get(pk=queue_id)
        if entry.status != QueueStatus.QUEUED:
            raise ValueError(f"Cannot cancel entry in status {entry.status}.")
        entry.status = QueueStatus.CANCELLED
        entry.save(update_fields=["status"])
        return entry

    def move(self, queue_id: int, direction: str) -> PaymentQueue:
        entry = PaymentQueue.objects.get(pk=queue_id)
        if direction == "up":
            neighbour = (
                PaymentQueue.objects
                .filter(position__lt=entry.position, status=QueueStatus.QUEUED)
                .order_by("-position").first()
            )
        else:
            neighbour = (
                PaymentQueue.objects
                .filter(position__gt=entry.position, status=QueueStatus.QUEUED)
                .order_by("position").first()
            )
        if not neighbour:
            return entry
        with transaction.atomic():
            entry.position, neighbour.position = neighbour.position, entry.position
            entry.save(update_fields=["position"])
            neighbour.save(update_fields=["position"])
        return entry

    # ── Execution ─────────────────────────────────────────────────────────────

    def execute_due(self) -> ExecuteResult:
        """Execute all QUEUED entries whose scheduled_at <= now. Returns summary."""
        now = timezone.now()
        due = list(
            PaymentQueue.objects
            .select_related("batch")
            .filter(status=QueueStatus.QUEUED, scheduled_at__lte=now)
            .order_by("position")
        )
        executed = skipped = failed = 0
        errors: List[str] = []

        for entry in due:
            try:
                self._execute_entry(entry)
                executed += 1
            except Exception as exc:
                label = f"Queue#{entry.position} batch={entry.batch.batch_number}"
                log.error("[Queue] Execution failed for %s: %s", label, exc)
                errors.append(f"{label}: {exc}")
                skipped += 1
                failed += 1

        return ExecuteResult(executed=executed, skipped=skipped, failed=failed, errors=errors)

    def _execute_entry(self, entry: PaymentQueue) -> None:
        """
        Full payment pipeline for a single queue entry:
          1. Submit to NCHL gateway → PaymentItem statuses updated
          2. Fetch SOSYS confirmation → SOSYSPaymentLog upserted
          3. Auto-reconcile NCHL vs SOSYS → ReconciliationRecord created
        """
        from ..adapters.factory import AdapterFactory
        from ..services.reconciliation_service import ReconciliationService
        from ..models import PaymentItem

        gw  = AdapterFactory.payment_gateway()
        sys = AdapterFactory.confirmation_system()
        audit = AdapterFactory.logger()

        entry.status = QueueStatus.EXECUTING
        entry.save(update_fields=["status"])

        batch = entry.batch
        items = list(batch.items.all())
        gateway_items = [{"claim_id": i.claim_id, "amount": float(i.amount)} for i in items]
        claim_ids = [i.claim_id for i in items]

        try:
            # ── Step 1: NCHL gateway ──────────────────────────────────────────
            gw_result = gw.submit_batch(batch.batch_number, gateway_items)
            audit.log_batch_submitted(batch.batch_number, len(items), gw_result)

            # Persist gateway results to PaymentItem (NOT to SOSYSPaymentLog)
            item_map = {item.claim_id: item for item in items}
            for r in gw_result.results:
                item = item_map.get(r.claim_id)
                if item:
                    item.status = "SUCCESS" if r.status == "SUCCESS" else "FAILED"
                    item.gateway_reference = r.gateway_reference
                    item.save(update_fields=["status", "gateway_reference", "updated_at"])

            # Update batch status
            from ..repositories.payment_repository import PaymentBatchRepository
            PaymentBatchRepository().update_status(batch, "SUBMITTED")

            # ── Step 2: SOSYS confirmation ────────────────────────────────────
            sosys_summary = sys.fetch_and_persist(claim_ids)

            # ── Step 3: Auto-reconcile ────────────────────────────────────────
            recon = ReconciliationService().run(claim_ids=claim_ids)
            audit.log_reconciliation_complete(
                batch.batch_number,
                matched=recon.matched,
                pending=recon.settlement_pending,
                errors=recon.status_mismatch + recon.investigation_required + recon.amount_mismatch,
            )

            entry.status    = QueueStatus.COMPLETED
            entry.executed_at = timezone.now()
            entry.notes = (
                f"NCHL: {len(items)} items | "
                f"SOSYS: {sosys_summary['fetched']}/{len(claim_ids)} confirmed | "
                f"Recon: {recon.matched} DONE, {recon.settlement_pending} PENDING, "
                f"{recon.status_mismatch + recon.investigation_required} ERROR"
            )
            entry.save(update_fields=["status", "executed_at", "notes"])

        except Exception as exc:
            from ..repositories.payment_repository import PaymentBatchRepository
            PaymentBatchRepository().update_status(batch, "FAILED")
            entry.status = QueueStatus.FAILED
            entry.notes  = str(exc)[:400]
            entry.save(update_fields=["status", "notes"])
            audit.log_error(f"batch={batch.batch_number}", exc)
            raise
