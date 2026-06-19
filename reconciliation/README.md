# Reconciliation Module

## Project Overview

The `reconciliation` package is a Django application for payment reconciliation between a gateway and bank statement records.

It provides:
- batch payment submission to a mock gateway service
- storage of gateway payment logs
- bank statement import from CSV/PDF
- claim-level reconciliation rules
- reconciliation result tracking and reporting
- retry batch creation for failed gateway payment items

Core models:
- `PaymentBatch`: a submitted payment batch and its status
- `PaymentItem`: individual payments inside a batch
- `SOSYSPaymentLog`: gateway response log for each claim
- `BankStatementRow`: imported bank statement row
- `ReconciliationRecord`: result of matching gateway and bank records

Reconciliation rules are implemented in `services/reconciliation_service.py` using the bank statement as the source of truth.

## Installation

1. Install package dependencies:

```bash
pip install -r reconciliation/requirements.txt
```

2. Add the module to your Django project:

```python
INSTALLED_APPS = [
    # ...
    "reconciliation",
]
```

3. Run migrations for the reconciliation app:

```bash
python manage.py migrate reconciliation
```

4. Configure optional gateway URL in `settings.py`:

```python
NCHL_GATEWAY_URL = "http://localhost:8001"
```

5. For PDF parsing support, install `pdfplumber` (already in requirements). For image-based PDF statements, also install `pytesseract` and configure Tesseract OCR.

```bash
pip install pytesseract
```

## Configuration

- `NCHL_GATEWAY_URL`: URL of the mock gateway service used by `services/gateway_client.py`. Defaults to `http://localhost:8001`.

## How It Works

1. Payment batches are submitted by creating `PaymentBatch` and `PaymentItem` records.
2. `GatewayClient` sends the batch to the gateway and records gateway responses in `SOSYSPaymentLog`.
3. Bank statements are imported via CSV/PDF into `BankStatementRow`.
4. `ReconciliationService` compares gateway logs and bank rows for each claim and writes a `ReconciliationRecord`.
5. Statuses are updated:
   - `MATCHED`
   - `SETTLEMENT_PENDING`
   - `STATUS_MISMATCH`
   - `INVESTIGATION_REQUIRED`
   - `AMOUNT_MISMATCH`
   - `NOT_SENT`

Bank statement rows are treated as source of truth, and `PaymentItem` status is updated from the bank status when reconciliation runs.

## Supported Bank Statement Formats

- CSV with columns: `claim_id`, `transaction_id`, `amount`, `status`, `settlement_date`
- PDF tabular statements with the same column headers
- Connect IPS payment slip PDF format (single transaction per page)

## API Endpoints

The module exposes REST API endpoints under its Django URL configuration.

- `POST /reconciliation/run`
  - Run reconciliation for all imported claims or a provided list of `claim_ids`.

- `POST /statements/upload`
  - Upload a CSV or PDF bank statement and persist rows.
  - Payload: multipart form with `file`, `type` (`csv` or `pdf`), and optional `claim_id` for Connect IPS slips.

- `POST /statements/preview`
  - Preview parsed PDF/CSV content without saving.

- `GET /reconciliation/results`
  - Retrieve all reconciliation records.

- `GET /reconciliation/failed`
  - Retrieve reconciliation records considered failed or requiring action.

- `GET /dashboard/summary`
  - Get reconciliation dashboard metrics.

- `POST /batch/retry`
  - Create a retry batch for failed payment items in an existing batch.
  - Payload: JSON with `batch_id`.

## Notes

- `StatementParser` uses `pdfplumber` for PDF extraction and optionally `pytesseract` for OCR on image-only PDFs.
- The reconciliation process deletes previous reconciliation results for the target claims before computing fresh results.
- The retry service will create a new linked batch containing failed items and attempt gateway resubmission.

## Development

- Add tests or extend functionality under `reconciliation/tests/`
- Review existing repositories and services in `reconciliation/repositories/` and `reconciliation/services/`
- The app is intended to be integrated into a Django project using standard Django app patterns.
