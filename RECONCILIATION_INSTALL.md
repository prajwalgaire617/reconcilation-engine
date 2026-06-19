# OpenIMIS Reconciliation Module — Installation Guide

## What This Solves

SSF staff currently reconcile payments by hand, comparing three data sources:
- OpenIMIS claim payment data
- SOSYS payment logs
- Bank statement

This module automates that process and provides a REST API + dashboard.

---

## Architecture

```
OpenIMIS Claims
      │
      ▼
Reconciliation Module (Django app)
      │
      ├── SOSYS Logs (sosys_payment_logs)
      ├── NCHL Mock Gateway (FastAPI, port 8001)
      └── Bank Statement (CSV / PDF upload)
      │
      ▼
Reconciliation Results + Dashboard API
```

---

## Step 1 — Install Dependencies

```bash
# Inside your OpenIMIS virtualenv
pip install djangorestframework requests pdfplumber

# For the mock gateway only
pip install fastapi uvicorn
```

---

## Step 2 — Register the App

In your OpenIMIS Django project `settings.py`:

```python
INSTALLED_APPS = [
    # ... existing apps ...
    "reconciliation",
]

# Optional: point to the mock gateway (default shown)
NCHL_GATEWAY_URL = "http://localhost:8001"
```

---

## Step 3 — Wire Up URLs

In your project `urls.py`:

```python
from django.urls import path, include

urlpatterns = [
    # ... existing urls ...
    path("api/v1/", include("reconciliation.api.urls")),
]
```

---

## Step 4 — Run Migrations

```bash
python manage.py migrate reconciliation
```

---

## Step 5 — Start the Mock Gateway

In a separate terminal:

```bash
cd /path/to/openimis-be-core_py
uvicorn mock_gateway.main:app --port 8001 --reload
```

Gateway docs available at: http://localhost:8001/docs

---

## Step 6 — Seed Demo Data

```bash
python manage.py seed_demo
```

This creates one batch with 6 claims that will each produce a different
reconciliation outcome when you run the engine.

---

## Step 7 — Run Reconciliation

```bash
curl -X POST http://localhost:8000/api/v1/reconciliation/run
```

Expected response:
```json
{
  "total_claims": 6,
  "matched": 1,
  "settlement_pending": 1,
  "status_mismatch": 1,
  "investigation_required": 1,
  "amount_mismatch": 1,
  "not_sent": 1
}
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/reconciliation/run` | Run reconciliation engine |
| POST | `/api/v1/statements/upload` | Upload bank statement (CSV or PDF) |
| GET  | `/api/v1/reconciliation/results` | All reconciliation results |
| GET  | `/api/v1/reconciliation/failed` | Only failed/problem results |
| GET  | `/api/v1/dashboard/summary` | Dashboard metrics |
| POST | `/api/v1/batch/retry` | Create retry batch for failed claims |

---

## Bank Statement Upload

**CSV upload:**
```bash
curl -X POST http://localhost:8000/api/v1/statements/upload \
  -F "file=@reconciliation/sample_data/bank_statement.csv" \
  -F "type=csv"
```

**PDF upload:**
```bash
curl -X POST http://localhost:8000/api/v1/statements/upload \
  -F "file=@statement.pdf" \
  -F "type=pdf"
```

CSV/PDF must have columns: `claim_id, transaction_id, amount, status, settlement_date`

---

## Retry Failed Payments

```bash
# Get the batch ID from /reconciliation/results or Django admin
curl -X POST http://localhost:8000/api/v1/batch/retry \
  -H "Content-Type: application/json" \
  -d '{"batch_id": 1}'
```

Response:
```json
{
  "retry_batch_id": 2,
  "retry_batch_number": "BATCH-DEMO-001-RETRY-1",
  "retried_claim_ids": [102, 103]
}
```

---

## Reconciliation Rules

| Gateway | Bank | Result |
|---------|------|--------|
| SUCCESS | SUCCESS (matching amount) | MATCHED |
| SUCCESS | not found | SETTLEMENT_PENDING |
| SUCCESS | FAILED | STATUS_MISMATCH |
| FAILED | SUCCESS | INVESTIGATION_REQUIRED |
| any | any (amount differs) | AMOUNT_MISMATCH |
| not found | any | NOT_SENT |

**Important:** Bank statement is the source of truth. Payment items are only
marked `SUCCESS` after bank confirmation, regardless of gateway response.

---

## Mock Gateway Demo

The FastAPI gateway supports `force_status` per item for controlled demos:

```bash
curl -X POST http://localhost:8001/batch-submit \
  -H "Content-Type: application/json" \
  -d '{
    "batch_number": "DEMO-001",
    "items": [
      {"claim_id": 101, "amount": 5000, "force_status": "SUCCESS"},
      {"claim_id": 102, "amount": 12500, "force_status": "FAILED"},
      {"claim_id": 103, "amount": 8750}
    ]
  }'
```

---

## Replacing Mock Claims with Real OpenIMIS Data

In `reconciliation/repositories/claim_repository.py`, swap the repository:

```python
# In claim_service.py, change:
from .repositories.claim_repository import MockClaimRepository
repo = MockClaimRepository()

# To:
from .repositories.claim_repository import OpenIMISClaimRepository
repo = OpenIMISClaimRepository()
```

`OpenIMISClaimRepository` reads from the live `claim.models.Claim` model
when `openimis-be-claim_py` is installed alongside this module.

---

## Project Structure

```
reconciliation/
├── models.py                  # DB tables
├── admin.py                   # Django admin
├── migrations/
│   └── 0001_initial.py
├── repositories/
│   ├── claim_repository.py    # Mock + OpenIMIS claim sources
│   ├── payment_repository.py  # Batch, Item, SOSYS, Bank repos
│   └── reconciliation_repository.py
├── services/
│   ├── claim_service.py       # Claim access layer
│   ├── gateway_client.py      # NCHL HTTP client → writes SOSYS log
│   ├── reconciliation_service.py  # Core engine
│   ├── retry_service.py       # Retry batch creation
│   └── statement_parser.py    # CSV + PDF parser
├── api/
│   ├── views.py
│   ├── serializers.py
│   └── urls.py
├── dashboard/
│   └── queries.py
├── management/commands/
│   └── seed_demo.py
└── sample_data/
    └── bank_statement.csv

mock_gateway/
└── main.py                    # FastAPI NCHL simulator
```
