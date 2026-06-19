"""
GatewayClient — legacy thin HTTP wrapper kept for backward compatibility.
New code should use NCHLGatewayAdapter via AdapterFactory.

Single Responsibility: this class ONLY does HTTP calls.
It does NOT write to any database table.
"""
import requests
from typing import List
from django.conf import settings

GATEWAY_BASE_URL = getattr(settings, "NCHL_GATEWAY_URL", "http://localhost:8001")


class GatewayClient:
    def submit_batch(self, batch_number: str, items: List[dict]) -> dict:
        payload = {"batch_number": batch_number, "items": items}
        resp = requests.post(f"{GATEWAY_BASE_URL}/batch-submit", json=payload, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_batch_status(self, gateway_batch_id: str) -> dict:
        resp = requests.get(f"{GATEWAY_BASE_URL}/batch/{gateway_batch_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_transaction_status(self, transaction_id: str) -> dict:
        resp = requests.get(f"{GATEWAY_BASE_URL}/transaction/{transaction_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_sosys_status(self, claim_id: int) -> dict:
        resp = requests.get(f"{GATEWAY_BASE_URL}/sosys/claim/{claim_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()
