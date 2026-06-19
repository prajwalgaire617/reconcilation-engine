"""
NCHL Gateway Adapter — Liskov-substitutable implementation of PaymentGatewayPort.
Translates between our domain model and the NCHL mock REST API.
"""
from decimal import Decimal
from typing import List
import requests
import logging
from django.conf import settings

from .base import PaymentGatewayPort, BatchSubmitResult, PaymentItemResult

log = logging.getLogger(__name__)


class NCHLGatewayAdapter(PaymentGatewayPort):
    """Adapter for the NCHL Connect-IPS payment gateway (mock during development)."""

    def __init__(self, base_url: str = None, timeout: int = 10):
        self._base_url = base_url or getattr(settings, "NCHL_GATEWAY_URL", "http://localhost:8001")
        self._timeout  = timeout

    def submit_batch(self, batch_number: str, items: List[dict]) -> BatchSubmitResult:
        payload = {"batch_number": batch_number, "items": items}
        log.info("[NCHL] Submitting batch %s with %d items to %s", batch_number, len(items), self._base_url)
        try:
            resp = requests.post(f"{self._base_url}/batch-submit", json=payload, timeout=self._timeout)
            resp.raise_for_status()
        except requests.exceptions.ConnectionError as exc:
            log.error("[NCHL] Gateway unreachable: %s", exc)
            raise ConnectionError(f"NCHL gateway unreachable at {self._base_url}") from exc
        except requests.exceptions.HTTPError as exc:
            log.error("[NCHL] Gateway HTTP error: %s", exc)
            raise

        data = resp.json()
        results = [
            PaymentItemResult(
                claim_id          = r["claim_id"],
                status            = r["status"],       # SUCCESS | FAILED | PARTIAL_SUCCESS
                gateway_reference = r.get("gateway_reference", ""),
                amount            = Decimal(str(r.get("amount", 0))),
                settled_amount    = Decimal(str(r.get("settled_amount", r.get("amount", 0)))),
                transaction_id    = r.get("transaction_id", ""),
            )
            for r in data.get("results", [])
        ]
        overall = data.get("status", "FAILED")
        log.info("[NCHL] Batch %s → %s (%d/%d success)", batch_number, overall,
                 sum(1 for r in results if r.status == "SUCCESS"), len(results))
        return BatchSubmitResult(
            gateway_batch_id = data.get("gateway_batch_id", ""),
            batch_number     = batch_number,
            overall_status   = overall,
            results          = results,
        )

    def get_batch_status(self, gateway_batch_id: str) -> dict:
        resp = requests.get(f"{self._base_url}/batch/{gateway_batch_id}", timeout=self._timeout)
        resp.raise_for_status()
        return resp.json()
