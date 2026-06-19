"""
SOSYS Confirmation System Adapter — implementation of ConfirmationSystemPort.
SOSYS (Social Security System) independently tracks whether payments were settled.
"""
from decimal import Decimal
from typing import List, Optional
import requests
import logging
from django.conf import settings

from .base import ConfirmationSystemPort, ConfirmationResult

log = logging.getLogger(__name__)


class SOSYSAdapter(ConfirmationSystemPort):
    """Adapter for the SOSYS payment confirmation system."""

    def __init__(self, base_url: str = None, timeout: int = 5):
        self._base_url = base_url or getattr(settings, "SOSYS_URL", "http://localhost:8001")
        self._timeout  = timeout

    def get_claim_status(self, claim_id: int) -> Optional[ConfirmationResult]:
        try:
            r = requests.get(f"{self._base_url}/sosys/claim/{claim_id}", timeout=self._timeout)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            data = r.json()
            return ConfirmationResult(
                claim_id       = claim_id,
                status         = "SUCCESS" if data.get("status") == "PASSED" else "FAILED",
                amount         = Decimal(str(data.get("amount", 0))),
                transaction_id = data.get("transaction_id", ""),
                raw            = data,
            )
        except requests.exceptions.ConnectionError:
            log.warning("[SOSYS] Unreachable for claim %d — skipping confirmation", claim_id)
            return None
        except Exception as exc:
            log.error("[SOSYS] Error fetching claim %d: %s", claim_id, exc)
            return None

    def fetch_and_persist(self, claim_ids: List[int]) -> dict:
        """Fetch SOSYS confirmation for each claim and persist to SOSYSPaymentLog."""
        from ..models import SOSYSPaymentLog

        fetched = not_found = errors = 0
        for claim_id in claim_ids:
            try:
                result = self.get_claim_status(claim_id)
                if result is None:
                    not_found += 1
                    continue
                SOSYSPaymentLog.objects.update_or_create(
                    claim_id=claim_id,
                    defaults={
                        "gateway_reference": result.transaction_id,
                        "amount":            result.amount,
                        "status":            result.status,
                        "response_payload":  result.raw,
                    },
                )
                fetched += 1
            except Exception as exc:
                log.error("[SOSYS] Failed to persist record for claim %d: %s", claim_id, exc)
                errors += 1

        log.info("[SOSYS] fetch_and_persist: %d fetched, %d not_found, %d errors", fetched, not_found, errors)
        return {"fetched": fetched, "not_found": not_found, "errors": errors}
