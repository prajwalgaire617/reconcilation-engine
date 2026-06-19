"""
SOSYS Client — fetches payment confirmation from the SOSYS (Social Security) system.

SOSYS is the hospital/SSF side that independently tracks whether payments were made.
After the NCHL gateway processes a payment, we call SOSYS to cross-check.

In production this would be the real SOSYS API. For demo, we use the mock endpoint
that returns payment status based on the NCHL gateway transaction already recorded.
"""
import logging
from decimal import Decimal
from typing import Optional

import requests

from django.conf import settings

logger = logging.getLogger(__name__)


class SOSYSClient:
    def __init__(self):
        self.base_url = getattr(settings, "SOSYS_URL", "http://localhost:8001")
        self.timeout  = getattr(settings, "SOSYS_TIMEOUT", 5)

    def get_claim_status(self, claim_id: int) -> Optional[dict]:
        """
        GET /sosys/claim/{claim_id}
        Returns dict with: claim_id, status (PASSED|FAILED), amount, transaction_id, processed_at
        Returns None if claim not found or request fails.
        """
        try:
            r = requests.get(
                f"{self.base_url}/sosys/claim/{claim_id}",
                timeout=self.timeout,
            )
            if r.status_code == 200:
                return r.json()
            if r.status_code == 404:
                return None
            logger.warning("SOSYS returned %s for claim %s", r.status_code, claim_id)
            return None
        except requests.exceptions.ConnectionError:
            logger.warning("SOSYS unreachable (claim %s) — marking as not confirmed", claim_id)
            return None
        except Exception as exc:
            logger.error("SOSYS call failed for claim %s: %s", claim_id, exc)
            return None

    def fetch_and_store(self, claim_ids: list) -> dict:
        """
        Fetch SOSYS status for each claim_id and persist to SOSYSPaymentLog.
        Returns summary: {fetched, not_found, errors}.
        """
        from ..models import SOSYSPaymentLog

        fetched = not_found = errors = 0
        for claim_id in claim_ids:
            try:
                data = self.get_claim_status(claim_id)
                if data is None:
                    not_found += 1
                    continue
                # Map PASSED → SUCCESS, FAILED → FAILED (normalize status)
                normalized = "SUCCESS" if data.get("status") == "PASSED" else "FAILED"
                SOSYSPaymentLog.objects.update_or_create(
                    claim_id=claim_id,
                    defaults={
                        "gateway_reference": data.get("transaction_id", ""),
                        "amount":            Decimal(str(data.get("amount", 0))),
                        "status":            normalized,
                        "response_payload":  data,
                    },
                )
                fetched += 1
            except Exception as exc:
                logger.error("Failed to store SOSYS record for claim %s: %s", claim_id, exc)
                errors += 1
        return {"fetched": fetched, "not_found": not_found, "errors": errors}
