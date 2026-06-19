"""
HTTP client for the mock NCHL gateway (FastAPI service).
Stores responses in SOSYSPaymentLog (the dummy SOSYS table).
"""
import uuid
from decimal import Decimal
from typing import List, Optional
import requests
from django.conf import settings
from ..repositories.payment_repository import SOSYSLogRepository


GATEWAY_BASE_URL = getattr(settings, "NCHL_GATEWAY_URL", "http://localhost:8001")


class GatewayClient:
    def __init__(self, sosys_repo: SOSYSLogRepository = None):
        self._sosys = sosys_repo or SOSYSLogRepository()

    def submit_batch(self, batch_number: str, items: List[dict]) -> dict:
        """
        POST /batch-submit to mock gateway.
        items: [{"claim_id": int, "amount": float, "force_status": str|None}]
        """
        payload = {"batch_number": batch_number, "items": items}
        resp = requests.post(f"{GATEWAY_BASE_URL}/batch-submit", json=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        for item_result in data.get("results", []):
            self._sosys.create(
                claim_id=item_result["claim_id"],
                gateway_reference=item_result.get("gateway_reference", str(uuid.uuid4())),
                amount=Decimal(str(item_result["amount"])),
                status=item_result["status"],
                payload=item_result,
            )

        return data

    def get_batch_status(self, gateway_batch_id: str) -> dict:
        resp = requests.get(f"{GATEWAY_BASE_URL}/batch/{gateway_batch_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_transaction_status(self, transaction_id: str) -> dict:
        resp = requests.get(f"{GATEWAY_BASE_URL}/transaction/{transaction_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()
