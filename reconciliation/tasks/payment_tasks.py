"""
Payment Celery tasks.

execute_queue_task   — runs every 60 seconds (via Celery Beat), picks up all due
                       queue entries and executes the full payment pipeline.
retry_batch_task     — triggered on-demand when an operator clicks "Retry" in the UI.

Why tasks instead of the daemon thread:

  execute_queue_task:
    - Celery Beat fires it exactly once per minute, even with N web workers.
      The daemon thread fires N times (one per worker process).
    - If the task hangs (gateway timeout), Celery kills it after SOFT_TIME_LIMIT
      and retries. The daemon thread blocks forever.
    - The task result (ExecuteQueueResultDTO.to_dict()) is stored in the
      result backend (Redis/Django DB). Flower shows it in real-time.

  retry_batch_task:
    - The HTTP view returns immediately with 202 Accepted; Celery runs the
      retry asynchronously. Without Celery, the view must block on the
      gateway call (potentially 30+ seconds).
"""
import logging
from celery import shared_task
from celery.utils.log import get_task_logger

log = get_task_logger(__name__)


@shared_task(
    name="reconciliation.tasks.payment_tasks.execute_queue_task",
    bind=True,
    max_retries=0,           # don't retry the scheduler itself — just log and move on
    soft_time_limit=55,      # warn at 55s (Celery Beat fires every 60s)
    time_limit=58,           # hard kill at 58s — never let two runs overlap
    acks_late=True,          # only ack after successful completion
)
def execute_queue_task(self):
    """
    Execute all due payment queue entries.

    This task is the Celery replacement for the daemon thread in apps.py.
    It runs the same QueueService.execute_due() logic, but:
    - The result is persisted to the Celery result backend.
    - Retries/failures are visible in Flower.
    - It cannot run concurrently with itself (time_limit prevents overlap).
    - It runs in a worker process, not the web server process.
    """
    from reconciliation.services.queue_service import QueueService
    result = QueueService().execute_due()

    log.info(
        "[execute_queue_task] executed=%d skipped=%d failed=%d",
        result.executed, result.skipped, result.failed,
    )
    for err in result.errors:
        log.warning("[execute_queue_task] error: %s", err)

    return result.to_dict()


@shared_task(
    name="reconciliation.tasks.payment_tasks.retry_batch_task",
    bind=True,
    max_retries=2,
    default_retry_delay=30,  # 30s between retries
    soft_time_limit=120,
    time_limit=150,
    acks_late=True,
)
def retry_batch_task(self, batch_id: int):
    """
    Retry a failed payment batch.

    Called from RetryBatchView instead of running the retry synchronously.
    The view returns 202 Accepted immediately; this task runs in the background.

    Why async?
      NCHL gateway calls can take 5-30 seconds. Blocking the web process
      for that duration during peak hours causes request timeouts for all
      other users.
    """
    from reconciliation.services.retry_service import RetryService
    log.info("[retry_batch_task] Retrying batch_id=%d", batch_id)
    try:
        result = RetryService().retry(batch_id)
        log.info("[retry_batch_task] batch_id=%d → %s", batch_id, result)
        return {"batch_id": batch_id, "status": "retried"}
    except Exception as exc:
        log.error("[retry_batch_task] batch_id=%d failed: %s", batch_id, exc)
        raise self.retry(exc=exc)
