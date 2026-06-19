# Reconciliation Module — Implementation Reference

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [End-to-End Data Flow](#3-end-to-end-data-flow)
4. [Reconciliation Engine](#4-reconciliation-engine)
5. [Data Sources](#5-data-sources)
6. [Gateway Client & Mock Gateway](#6-gateway-client--mock-gateway)
7. [Statement Parser](#7-statement-parser)
8. [Retry Service](#8-retry-service)
9. [Dashboard Queries](#9-dashboard-queries)
10. [Claim Repository](#10-claim-repository)
11. [API Reference](#11-api-reference)

---

## 1. Overview

The reconciliation module automates three-way payment verification for SSF (Social Security Fund) claim payments. Before this module, staff manually compared three independent data sources to confirm whether a payment actually settled. This module ingests all three sources and applies deterministic rules to classify each claim into one of six outcomes.

**The three data sources:**

| Source | What it records | Table |
|--------|----------------|-------|
| NCHL Gateway (via SOSYS) | Whether the payment instruction was sent and what the gateway responded | `sosys_payment_logs` |
| Bank Statement | Whether the bank actually debited and settled funds | `bank_statement_rows` |
| OpenIMIS Claims | Which claims are approved and at what amount | Live OpenIMIS DB or mock |

**Core principle — bank is the source of truth.** A payment is only considered successful when the bank statement confirms it, regardless of what the gateway reported.

---

## 2. Data Model

Five tables support the module, all in `reconciliation/models.py`.

### `payment_batches`

A batch groups multiple claims into a single payment run submitted to the gateway.

| Column | Type | Notes |
|--------|------|-------|
| `batch_number` | CharField (unique) | Human-readable ID e.g. `BATCH-DEMO-001` |
| `status` | CharField | `PENDING` → `SUBMITTED` → `COMPLETED` / `PARTIAL` / `FAILED` |
| `parent_batch` | FK → self (nullable) | Set when this batch is a retry of another |
| `retry_count` | IntegerField | Incremented on each retry generation |

### `payment_items`

One row per claim within a batch. Records the claim being paid and its current payment status.

| Column | Type | Notes |
|--------|------|-------|
| `batch` | FK → PaymentBatch | |
| `claim_id` | IntegerField | Foreign key into OpenIMIS claim space |
| `amount` | DecimalField | Approved claim amount |
| `status` | CharField | `PENDING` → `SUCCESS` / `FAILED` / `RETRY` |
| `gateway_reference` | CharField | Reference ID returned by gateway |

### `sosys_payment_logs`

Immutable log of every gateway response, written by `GatewayClient` after each submission. Named after SOSYS (the payment middleware layer). One row per claim per submission attempt.

| Column | Type | Notes |
|--------|------|-------|
| `claim_id` | IntegerField | |
| `gateway_reference` | CharField | `NCHL-XXXXXXXX` reference |
| `amount` | DecimalField | Amount submitted |
| `status` | CharField | Raw gateway status: `SUCCESS`, `FAILED`, `PARTIAL_SUCCESS` |
| `response_payload` | JSONField | Full gateway response stored for audit |

### `bank_statement_rows`

Rows parsed from uploaded bank statements (CSV or PDF). One row per transaction confirmed by the bank.

| Column | Type | Notes |
|--------|------|-------|
| `claim_id` | IntegerField | |
| `transaction_id` | CharField | Bank's own transaction reference |
| `amount` | DecimalField | Amount the bank settled |
| `status` | CharField | `SUCCESS` or `FAILED` |
| `settlement_date` | DateField | Date the bank processed the transaction |
| `import_batch` | CharField | UUID-based tag linking rows to one upload |

### `reconciliation_results`

Output of the reconciliation engine. Rebuilt on every `POST /reconciliation/run`. One row per claim.

| Column | Type | Notes |
|--------|------|-------|
| `claim_id` | IntegerField | |
| `payment_item` | FK → PaymentItem (nullable) | |
| `gateway_status` | CharField | Copied from SOSYS log at time of reconciliation |
| `bank_status` | CharField | Copied from bank statement at time of reconciliation |
| `gateway_amount` | DecimalField (nullable) | |
| `bank_amount` | DecimalField (nullable) | |
| `result` | CharField | One of the six outcome codes |
| `reason` | TextField | Human-readable explanation of the outcome |

---

## 3. End-to-End Data Flow

```
1. Claims exist in OpenIMIS (or mock) — approved, awaiting payment

2. A PaymentBatch is created containing approved claims as PaymentItems

3. GatewayClient.submit_batch() POSTs to NCHL gateway:
   - Gateway processes each claim item
   - For each item, a SOSYSPaymentLog row is written (success or fail)
   - PaymentItem.status is set from gateway response (preliminary)

4. Bank uploads a statement (CSV or PDF) via POST /statements/upload:
   - StatementParser extracts rows
   - BankStatementRow records are written to the DB
   - This is the authoritative record of what actually settled

5. POST /reconciliation/run triggers the engine:
   - Loads all SOSYSPaymentLog records into a dict indexed by claim_id
   - Loads all BankStatementRow records into a dict indexed by claim_id
   - For each unique claim_id seen in either source:
       → applies rule table → writes ReconciliationRecord
       → updates PaymentItem.status from the bank (source-of-truth update)

6. GET /dashboard/summary and GET /reconciliation/results expose outcomes

7. POST /batch/retry creates a new batch for claims that failed,
   re-submits them to the gateway, and the cycle repeats from step 3
```

---

## 4. Reconciliation Engine

All logic lives in `reconciliation/services/reconciliation_service.py`.

### 4.1 Entry Point

```python
ReconciliationService.run(claim_ids=None)
```

If `claim_ids` is provided, only those claims are reconciled. Otherwise all claims seen in either SOSYS logs or bank statement are processed.

**Step 1 — build indexes.** Both repositories load their full tables and return Python dicts keyed by `claim_id`. Only the most recent record per claim is kept (ordered by `-created_at` / `-settlement_date`):

```python
sosys_by_claim = self._sosys.all_indexed_by_claim()   # {claim_id: SOSYSPaymentLog}
bank_by_claim  = self._bank.all_indexed_by_claim()    # {claim_id: BankStatementRow}
```

**Step 2 — determine scope.** The union of both key sets gives every claim that has any record in any source:

```python
all_claim_ids = set(sosys_by_claim.keys()) | set(bank_by_claim.keys())
```

**Step 3 — idempotency delete.** Existing `ReconciliationRecord` rows for the in-scope claims are deleted before writing new ones. This makes `run` safely re-entrant — calling it twice gives the same result as calling it once:

```python
self._recon.delete_for_claims(list(all_claim_ids))
```

**Step 4 — per-claim reconciliation loop.**

```python
for claim_id in sorted(all_claim_ids):
    record = self._reconcile_claim(claim_id, sosys_by_claim, bank_by_claim)
    self._update_payment_item_from_bank(claim_id, bank_by_claim)
```

---

### 4.2 Rule Table

`_apply_rules(gw_status, bank_status, gw_amount, bank_amount)` implements six mutually exclusive rules evaluated in priority order.

| Priority | Gateway Status | Bank Status | Amount Check | Outcome | Reason |
|----------|---------------|-------------|--------------|---------|--------|
| 1 | _(empty)_ | any | — | `NOT_SENT` | No SOSYS log exists — payment was never submitted to gateway |
| 2 | `SUCCESS` | `SUCCESS` | differ by > 0.01 | `AMOUNT_MISMATCH` | Both confirm payment but amounts disagree |
| 3 | `SUCCESS` | `SUCCESS` | match | `MATCHED` | Full agreement — payment complete |
| 4 | `SUCCESS` | _(empty)_ | — | `SETTLEMENT_PENDING` | Gateway approved but bank hasn't confirmed yet |
| 5 | `SUCCESS` | `FAILED` | — | `STATUS_MISMATCH` | Gateway and bank disagree — manual review needed |
| 6 | `FAILED` | `SUCCESS` | — | `INVESTIGATION_REQUIRED` | Bank settled despite gateway failure — possible double payment |
| fallback | any | any | — | `STATUS_MISMATCH` | Unhandled combination logged with raw statuses |

**Amount tolerance** is `Decimal("0.01")` — differences of 1 paisa or less are ignored to absorb floating-point rounding in source systems.

### 4.3 Code Walkthrough

```python
def _apply_rules(self, gw_status, bank_status, gw_amount, bank_amount):

    # Rule 1: No gateway record at all
    if not gw_status:
        return NOT_SENT, "No SOSYS/gateway record found for this claim."

    # Rules 2 & 3: Both succeeded — check amounts
    if gw_status == "SUCCESS" and bank_status == "SUCCESS":
        if gw_amount and bank_amount and abs(gw_amount - bank_amount) > 0.01:
            return AMOUNT_MISMATCH, f"Gateway {gw_amount} ≠ bank {bank_amount}."
        return MATCHED, "Gateway and bank both confirm success."

    # Rule 4: Gateway ok, bank silent
    if gw_status == "SUCCESS" and not bank_status:
        return SETTLEMENT_PENDING, "..."

    # Rule 5: Gateway ok, bank failed
    if gw_status == "SUCCESS" and bank_status == "FAILED":
        return STATUS_MISMATCH, "..."

    # Rule 6: Gateway failed, bank succeeded
    if gw_status == "FAILED" and bank_status == "SUCCESS":
        return INVESTIGATION_REQUIRED, "Possible double payment risk."

    # Catch-all amount check
    if gw_amount and bank_amount and abs(gw_amount - bank_amount) > 0.01:
        return AMOUNT_MISMATCH, ...

    return STATUS_MISMATCH, f"Unhandled: gateway={gw_status}, bank={bank_status}."
```

### 4.4 Bank-as-Source-of-Truth Update

After each claim is reconciled, `_update_payment_item_from_bank` overwrites the `PaymentItem.status` with what the bank says, regardless of the gateway result:

```python
bank_status = bank_row.status.upper()
item_status = "SUCCESS" if bank_status == "SUCCESS" else "FAILED"
if item.status != item_status:
    item.status = item_status
    item.save(update_fields=["status", "updated_at"])
```

This means `PaymentItem` always reflects the bank's authoritative view after reconciliation runs.

---

## 5. Data Sources

### 5.1 SOSYS Log (Gateway Source)

`SOSYSLogRepository.all_indexed_by_claim()` fetches all logs ordered by `-created_at` and keeps only the first (most recent) log per `claim_id`. This means if a claim was submitted multiple times (e.g., after a retry), the latest gateway result wins.

### 5.2 Bank Statement (Bank Source)

`BankStatementRepository.all_indexed_by_claim()` follows the same pattern — ordered by `-settlement_date`, most recent per `claim_id` wins. When multiple statements are uploaded over time (e.g., daily uploads), the latest settlement date for each claim is the one used.

---

## 6. Gateway Client & Mock Gateway

### GatewayClient (`reconciliation/services/gateway_client.py`)

The Django-side HTTP client. Configured via `settings.NCHL_GATEWAY_URL` (defaults to `http://localhost:8001`).

`submit_batch(batch_number, items)`:
1. POSTs `{batch_number, items}` to `/batch-submit`
2. Iterates the `results` array in the response
3. For each item result, calls `SOSYSLogRepository.create()` — this persists the gateway response to the DB immediately, before anything else

### Mock NCHL Gateway (`mock_gateway/main.py`)

A FastAPI service that simulates the NCHL payment gateway. Runs separately on port 8001.

**`POST /batch-submit`**

For each item in the request, `_process_item()` runs:
- If `force_status` is set on the item, that status is used (useful for demos)
- Otherwise a weighted random draw: 70% SUCCESS, 20% FAILED, 10% PARTIAL_SUCCESS
- For `PARTIAL_SUCCESS`, the `settled_amount` is 90% of the submitted amount — this is how `AMOUNT_MISMATCH` gets triggered in practice
- Returns a `gateway_reference` (`NCHL-XXXXXXXX`) and a `transaction_id` (`TXN-XXXXXXXXXX`)

All results are stored in module-level dicts (`_batches`, `_transactions`) — they reset when the process restarts.

**`GET /batch/{batch_id}`** and **`GET /transaction/{transaction_id}`** allow status polling after submission.

---

## 7. Statement Parser

`reconciliation/services/statement_parser.py`

Supports CSV and PDF. Both produce a list of `StatementRow` dataclasses with fields: `claim_id`, `transaction_id`, `amount`, `status`, `settlement_date`.

### CSV

`parse_csv()` uses Python's `csv.DictReader`. Decodes with `utf-8-sig` (handles Excel-exported CSVs that prepend a BOM). Column names must match exactly (case-insensitive via the dict keys):

```
claim_id, transaction_id, amount, status, settlement_date
```

### PDF — Three-Level Fallback

`parse_pdf()` tries three strategies in order and uses the first that yields rows with all required columns:

**Level 1 — Bordered table detection**
```python
table = page.extract_table()
```
pdfplumber traces horizontal and vertical lines to detect table borders. Works well when the PDF was generated from a proper table in Word or Excel. If it returns `None` or the header columns don't match, falls through.

**Level 2 — Text-cluster table (no borders)**
```python
table = page.extract_table(
    table_settings={"vertical_strategy": "text", "horizontal_strategy": "text"}
)
```
Groups words by their x/y positions to infer columns from whitespace alignment. Works for PDFs that have visually tabular data but no drawn borders. Falls through if columns still don't match.

**Level 3 — Raw text line parsing**
```python
text = page.extract_text()
```
Extracts the full page text, splits into lines, finds the first line where all five expected column names appear as whitespace-separated tokens, then reads every subsequent line as a space-split data row.

This last fallback handles dense or unusual PDF layouts where neither table strategy works.

### Amount and Date Parsing

- **Amount**: strips all non-digit/dot characters (`re.sub(r"[^\d.]", "", ...)`) before converting to `Decimal`. Handles currency symbols, commas, and spaces.
- **Date**: tries three formats in order: `%Y-%m-%d`, `%d/%m/%Y`, `%d-%m-%Y`. Raises `ValueError` with the attempted formats listed if none match.

---

## 8. Retry Service

`reconciliation/services/retry_service.py`

`RetryService.create_retry_batch(original_batch_id)`:

1. Loads the original `PaymentBatch` by ID
2. Queries `batch.items.filter(status="FAILED")` — only failed items are retried
3. Builds a new `batch_number`: `{original_number}-RETRY-{retry_count}`
4. Creates a new `PaymentBatch` with `parent_batch=original` and incremented `retry_count`
5. `bulk_create`s new `PaymentItem` rows on the retry batch for each failed claim
6. Calls `GatewayClient.submit_batch()` with the retry items
7. Updates the new `PaymentItem` statuses from the gateway response
8. If the gateway call raises any exception, the retry batch is set to `PENDING` (not lost — can be retried again later)

The `parent_batch` FK chain means you can trace the full retry history: `BATCH-001 → BATCH-001-RETRY-1 → BATCH-001-RETRY-2`.

---

## 9. Dashboard Queries

`reconciliation/dashboard/queries.py`

All metrics are computed in a single pass over the DB using Django's aggregation framework (no Python-level loops).

`DashboardQueries.summary()` runs two aggregate queries and one count:

```python
# Query 1: reconciliation outcome counts
recon_agg = ReconciliationRecord.objects.aggregate(
    total=Count("id"),
    matched=Count("id", filter=Q(result=MATCHED)),
    pending=Count("id", filter=Q(result=SETTLEMENT_PENDING)),
    mismatch=Count("id", filter=Q(result=AMOUNT_MISMATCH)),
)

# Count of all "problem" outcomes in one query
failed_count = ReconciliationRecord.objects.filter(
    result__in=[STATUS_MISMATCH, INVESTIGATION_REQUIRED, AMOUNT_MISMATCH, NOT_SENT]
).count()

# Query 2: total payment volume
item_agg = PaymentItem.objects.aggregate(total_amount=Sum("amount"))

# Count retry batches (those with a parent_batch set)
retry_count = PaymentBatch.objects.filter(parent_batch__isnull=False).count()
```

**Reconciliation rate** is derived in Python:
```python
rate = round((matched / total * 100), 2) if total > 0 else 0.0
```

---

## 10. Claim Repository

`reconciliation/repositories/claim_repository.py`

Uses the Abstract Base Class pattern so the rest of the code is not coupled to any specific data source.

### MockClaimRepository (default)

Returns eight hardcoded `ClaimDTO` objects. Used in development and the demo. `seed_demo` uses claim IDs 101–106 which correspond to entries in this list.

### OpenIMISClaimRepository

Reads from `claim.models.Claim` — available only when `openimis-be-claim_py` is installed alongside this module. Filters by `Claim.STATUS_VALUATED` (the OpenIMIS "approved" state) and maps to `ClaimDTO` using `c.approved` as the amount.

**Switching repositories** in `reconciliation/services/claim_service.py`:

```python
# Default (mock):
repo = MockClaimRepository()

# Production (live OpenIMIS):
repo = OpenIMISClaimRepository()
```

---

## 11. API Reference

All routes are mounted under the prefix `api/v1/` (configured in `urls.py`).

### `POST /api/v1/reconciliation/run`

Triggers the reconciliation engine for all claims (or a subset via `claim_ids` body param).

**Request body (optional):**
```json
{ "claim_ids": [101, 102, 103] }
```

**Response:**
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

**Side effects:** deletes existing `ReconciliationRecord` rows for the in-scope claims, writes new ones, updates `PaymentItem.status` from bank.

---

### `POST /api/v1/statements/upload`

Parses and imports a bank statement file. Accepts multipart form data.

**Form fields:**
- `file` — the CSV or PDF file
- `type` — `"csv"` or `"pdf"` (default: `"csv"`)

**Response:**
```json
{ "import_batch": "IMPORT-A3F2B1C0", "rows_imported": 5 }
```

Each upload gets a unique `import_batch` tag so rows can be traced back to their import.

---

### `GET /api/v1/reconciliation/results`

Returns all `ReconciliationRecord` rows with linked `PaymentItem` data.

---

### `GET /api/v1/reconciliation/failed`

Returns only records with result in: `STATUS_MISMATCH`, `INVESTIGATION_REQUIRED`, `AMOUNT_MISMATCH`, `NOT_SENT`.

---

### `GET /api/v1/dashboard/summary`

Returns aggregated metrics:

```json
{
  "total_claims": 6,
  "total_amount": "54850.00",
  "successful_payments": 1,
  "failed_payments": 4,
  "pending_settlements": 1,
  "amount_mismatches": 1,
  "retry_count": 0,
  "reconciliation_rate": 16.67
}
```

---

### `POST /api/v1/batch/retry`

Creates a retry batch for all `FAILED` items in an existing batch.

**Request body:**
```json
{ "batch_id": 1 }
```

**Response:**
```json
{
  "retry_batch_id": 2,
  "retry_batch_number": "BATCH-DEMO-001-RETRY-1",
  "retried_claim_ids": [102, 103]
}
```

**Side effects:** creates a new `PaymentBatch` and `PaymentItem` rows, submits to gateway, writes new `SOSYSPaymentLog` entries. Run `/reconciliation/run` afterwards to update reconciliation results.
