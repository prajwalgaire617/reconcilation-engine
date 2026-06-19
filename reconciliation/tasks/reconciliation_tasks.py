"""
Reconciliation Celery task.

reconcile_batch_task — triggered automatically after a batch is executed
                       by QueueService._execute_entry(). Separated into a
                       task so the reconciliation can be retried independently
                       if it fails (e.g. SOSYS is temporarily down).
"""
import logging
from celery import shared_task
from celery.utils.log import get_task_logger

log = get_task_logger(__name__)


@shared_task(
    name="reconciliation.tasks.reconciliation_tasks.reconcile_batch_task",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    soft_time_limit=180,
    time_limit=240,
    acks_late=True,
)
def reconcile_batch_task(self, claim_ids: list, batch_number: str = ""):
    """
    Run reconciliation for a specific set of claims.

    Dispatched by QueueService after gateway execution completes.
    Separating reconciliation into its own task means:
      - If SOSYS is down, only the reconciliation step is retried,
        not the entire payment execution (which already settled at NCHL).
      - The gateway and reconciliation can be monitored independently in Flower.
    """
    from reconciliation.services.reconciliation_service import ReconciliationService
    from reconciliation.dtos.reconciliation import RunReconciliationCommand

    log.info(
        "[reconcile_batch_task] batch=%s claims=%d",
        batch_number or "?", len(claim_ids),
    )
    try:
        summary = ReconciliationService().run_from_command(
            RunReconciliationCommand(claim_ids=claim_ids)
        )
        log.info(
            "[reconcile_batch_task] batch=%s matched=%d errors=%d rate=%.1f%%",
            batch_number, summary.matched, summary.total_errors, summary.match_rate,
        )
        return summary.to_dict()
    except Exception as exc:
        log.error("[reconcile_batch_task] batch=%s failed: %s", batch_number, exc)
        raise self.retry(exc=exc)
