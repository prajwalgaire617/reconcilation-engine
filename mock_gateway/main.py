"""
Mock NCHL Payment Gateway — FastAPI service.

Run:
    uvicorn mock_gateway.main:app --port 8001 --reload

Endpoints:
    POST /batch-submit
    GET  /batch/{batch_id}
    GET  /transaction/{transaction_id}

Pass force_status per item to control outcome for demos:
    {"claim_id": 101, "amount": 5000, "force_status": "FAILED"}
"""
import random
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


app = FastAPI(title="Mock NCHL Payment Gateway", version="1.0.0")

# In-memory store (good enough for hackathon demo)
_batches: Dict[str, dict] = {}
_transactions: Dict[str, dict] = {}


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class GatewayItem(BaseModel):
    claim_id: int
    amount: float
    force_status: Optional[str] = None  # SUCCESS | FAILED | PARTIAL_SUCCESS


class BatchSubmitRequest(BaseModel):
    batch_number: str
    items: List[GatewayItem]


class BatchSubmitResponse(BaseModel):
    gateway_batch_id: str
    batch_number: str
    status: str
    results: List[dict]
    submitted_at: str


class BatchStatusResponse(BaseModel):
    gateway_batch_id: str
    batch_number: str
    status: str
    total_items: int
    success_count: int
    failed_count: int
    results: List[dict]


class TransactionResponse(BaseModel):
    transaction_id: str
    claim_id: int
    amount: float
    status: str
    processed_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _process_item(item: GatewayItem) -> dict:
    """Simulate payment processing for a single claim."""
    txn_id = f"TXN-{uuid.uuid4().hex[:10].upper()}"

    if item.force_status:
        raw_status = item.force_status.upper()
    else:
        # 70% success, 20% fail, 10% partial — realistic demo mix
        raw_status = random.choices(
            ["SUCCESS", "FAILED", "PARTIAL_SUCCESS"],
            weights=[70, 20, 10],
        )[0]

    # PARTIAL_SUCCESS: gateway processed but amount differs slightly
    settled_amount = item.amount
    if raw_status == "PARTIAL_SUCCESS":
        settled_amount = round(item.amount * 0.9, 2)

    gateway_ref = f"NCHL-{uuid.uuid4().hex[:8].upper()}"

    result = {
        "claim_id": item.claim_id,
        "transaction_id": txn_id,
        "gateway_reference": gateway_ref,
        "amount": item.amount,
        "settled_amount": settled_amount,
        "status": raw_status,
        "processed_at": datetime.utcnow().isoformat(),
    }

    _transactions[txn_id] = result
    _transactions[gateway_ref] = result  # allow lookup by either key
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/batch-submit", response_model=BatchSubmitResponse)
def batch_submit(req: BatchSubmitRequest):
    gateway_batch_id = f"BATCH-{uuid.uuid4().hex[:8].upper()}"
    results = [_process_item(item) for item in req.items]

    success_count = sum(1 for r in results if r["status"] == "SUCCESS")
    failed_count = len(results) - success_count

    if success_count == len(results):
        batch_status = "SUCCESS"
    elif success_count == 0:
        batch_status = "FAILED"
    else:
        batch_status = "PARTIAL_SUCCESS"

    batch_record = {
        "gateway_batch_id": gateway_batch_id,
        "batch_number": req.batch_number,
        "status": batch_status,
        "total_items": len(results),
        "success_count": success_count,
        "failed_count": failed_count,
        "results": results,
        "submitted_at": datetime.utcnow().isoformat(),
    }
    _batches[gateway_batch_id] = batch_record

    return BatchSubmitResponse(**batch_record)


@app.get("/batch/{batch_id}", response_model=BatchStatusResponse)
def get_batch(batch_id: str):
    batch = _batches.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail=f"Batch {batch_id!r} not found.")
    return BatchStatusResponse(**batch)


@app.get("/transaction/{transaction_id}", response_model=TransactionResponse)
def get_transaction(transaction_id: str):
    txn = _transactions.get(transaction_id)
    if not txn:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id!r} not found.")
    return TransactionResponse(
        transaction_id=txn["transaction_id"],
        claim_id=txn["claim_id"],
        amount=txn["amount"],
        status=txn["status"],
        processed_at=txn["processed_at"],
    )


@app.get("/health")
def health():
    return {"status": "ok", "batches": len(_batches), "transactions": len(_transactions) // 2}
