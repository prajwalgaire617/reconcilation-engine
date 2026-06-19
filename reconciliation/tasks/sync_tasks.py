"""
FHIR sync Celery task.

fhir_sync_task — replaces `python manage.py fetch_fhir_claims`
                 Runs nightly at 01:00 Asia/Kathmandu via Celery Beat.

Why a task instead of a management command run via crontab?
  - Management commands require SSH access or a Kubernetes CronJob manifest.
  - Celery Beat is already running as part of the application stack.
  - The task result (created/updated counts) is persisted in the result backend.
  - If the FHIR server is down, Celery automatically retries with backoff.
  - You can trigger ad-hoc syncs from the Django admin or Flower without SSH.
"""
import logging
from celery import shared_task
from celery.utils.log import get_task_logger

log = get_task_logger(__name__)


@shared_task(
    name="reconciliation.tasks.sync_tasks.fhir_sync_task",
    bind=True,
    max_retries=3,
    default_retry_delay=300,   # 5 minutes between retries (FHIR server may be slow)
    soft_time_limit=300,
    time_limit=360,
    acks_late=True,
)
def fhir_sync_task(self, months: int = 3):
    """
    Fetch claims from the FHIR R4 server and upsert into local cache.

    Triggered:
      - Nightly by Celery Beat (01:00 Asia/Kathmandu)
      - On-demand by POST /api/v1/claims/fetch (view dispatches the task)
      - Manually via: celery -A celery_app call reconciliation.tasks.sync_tasks.fhir_sync_task
    """
    from reconciliation.services.claim_service import ClaimService
    from reconciliation.dtos.claim import FetchClaimsCommand

    log.info("[fhir_sync_task] Starting FHIR sync for months=%d", months)
    try:
        result = ClaimService().sync_fhir(FetchClaimsCommand(months=months))
        log.info(
            "[fhir_sync_task] Complete: fetched=%d created=%d updated=%d skipped=%d",
            result.fetched, result.created, result.updated, result.skipped,
        )
        return {
            "fetched": result.fetched,
            "created": result.created,
            "updated": result.updated,
            "skipped": result.skipped,
        }
    except ConnectionError as exc:
        log.warning("[fhir_sync_task] FHIR server unreachable: %s — will retry", exc)
        raise self.retry(exc=exc)
