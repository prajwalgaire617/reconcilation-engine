"""
Reconciliation Engine — NCHL vs SOSYS.

Data flow:
  1. Queue executes batch → NCHL gateway responds → PaymentItem updated
  2. SOSYSClient fetches SOSYS confirmation → SOSYSPaymentLog updated
  3. ReconciliationService.run() → reads PaymentItem (NCHL) + SOSYSPaymentLog (SOSYS)
                                 → writes ReconciliationRecord per claim

Rules:
  NCHL=SUCCESS  + SOSYS=SUCCESS  → MATCHED            (both systems confirm)
  NCHL=SUCCESS  + SOSYS=missing  → SETTLEMENT_PENDING (NCHL ok, SOSYS not yet)
  NCHL=SUCCESS  + SOSYS=FAILED   → STATUS_MISMATCH    (investigate)
  NCHL=FAILED   + SOSYS=SUCCESS  → INVESTIGATION_REQUIRED (risk: double payment)
  Amount differs by >0.01        → AMOUNT_MISMATCH
  No NCHL record at all          → NOT_SENT

Payment status mapping (for UI):
  MATCHED            → DONE
  SETTLEMENT_PENDING → PENDING
  everything else    → ERROR
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import List, Optional

from ..models import ReconciliationResult
from ..repositories.reconciliation_repository import ReconciliationRepository


@dataclass
class ReconciliationSummary:
    total_claims: int
    matched: int
    settlement_pending: int
    status_mismatch: int
    investigation_required: int
    amount_mismatch: int
    not_sent: int
    results: list


class ReconciliationService:
    AMOUNT_TOLERANCE = Decimal("0.01")

    def __init__(self, recon_repo: ReconciliationRepository = None):
        self._recon = recon_repo or ReconciliationRepository()

    def run(self, claim_ids: Optional[List[int]] = None) -> ReconciliationSummary:
        """
        Reconcile NCHL (PaymentItem) against SOSYS (SOSYSPaymentLog).

        If claim_ids is None, processes ALL claims that have a PaymentItem.
        Always re-runs (deletes old ReconciliationRecords for affected claims).
        """
        from ..models import PaymentItem, SOSYSPaymentLog

        # Build NCHL index: claim_id → PaymentItem (gateway result)
        items_qs = PaymentItem.objects.filter(status__in=["SUCCESS", "FAILED"])
        if claim_ids:
            items_qs = items_qs.filter(claim_id__in=claim_ids)
        nchl_by_claim = {item.claim_id: item for item in items_qs}

        # Build SOSYS index: claim_id → SOSYSPaymentLog (hospital/SSF confirmation)
        sosys_qs = SOSYSPaymentLog.objects.all()
        if claim_ids:
            sosys_qs = sosys_qs.filter(claim_id__in=claim_ids)
        sosys_by_claim = {log.claim_id: log for log in sosys_qs}

        # Process all claims that NCHL has a record for
        target_ids = set(nchl_by_claim.keys())
        if not target_ids:
            return ReconciliationSummary(0, 0, 0, 0, 0, 0, 0, [])

        self._recon.delete_for_claims(list(target_ids))

        records = [
            self._reconcile_one(cid, nchl_by_claim, sosys_by_claim)
            for cid in sorted(target_ids)
        ]

        return self._build_summary(records)

    def run_for_batch(self, batch) -> ReconciliationSummary:
        """Convenience: reconcile all claims in a specific PaymentBatch."""
        claim_ids = list(batch.items.values_list("claim_id", flat=True))
        return self.run(claim_ids=claim_ids)

    def _reconcile_one(self, claim_id: int, nchl_index: dict, sosys_index: dict):
        nchl  = nchl_index.get(claim_id)
        sosys = sosys_index.get(claim_id)

        nchl_status  = nchl.status  if nchl  else ""     # SUCCESS | FAILED
        sosys_status = sosys.status if sosys else ""     # SUCCESS | FAILED
        nchl_amount  = nchl.amount  if nchl  else None
        sosys_amount = sosys.amount if sosys else None

        result, reason = self._apply_rules(nchl_status, sosys_status, nchl_amount, sosys_amount)

        return self._recon.create(
            claim_id       = claim_id,
            result         = result,
            gateway_status = nchl_status,   # NCHL = payment gateway
            bank_status    = sosys_status,  # SOSYS = confirmation system
            gateway_amount = nchl_amount,
            bank_amount    = sosys_amount,
            reason         = reason,
            payment_item_id = nchl.id if nchl else None,
        )

    def _apply_rules(
        self,
        nchl_status: str,
        sosys_status: str,
        nchl_amount: Optional[Decimal],
        sosys_amount: Optional[Decimal],
    ):
        # No NCHL record at all → not submitted
        if not nchl_status:
            return ReconciliationResult.NOT_SENT, "No NCHL gateway record for this claim."

        # Amount mismatch check (before status checks to catch PARTIAL_SUCCESS)
        if nchl_amount and sosys_amount and abs(nchl_amount - sosys_amount) > self.AMOUNT_TOLERANCE:
            return ReconciliationResult.AMOUNT_MISMATCH, (
                f"Amount mismatch: NCHL={nchl_amount}, SOSYS={sosys_amount}. "
                "Possible partial settlement."
            )

        if nchl_status == "SUCCESS" and sosys_status == "SUCCESS":
            return ReconciliationResult.MATCHED, "NCHL and SOSYS both confirm payment."

        if nchl_status == "SUCCESS" and not sosys_status:
            return ReconciliationResult.SETTLEMENT_PENDING, (
                "NCHL processed payment but SOSYS has not yet confirmed. Awaiting settlement."
            )

        if nchl_status == "SUCCESS" and sosys_status == "FAILED":
            return ReconciliationResult.STATUS_MISMATCH, (
                "NCHL reports success but SOSYS reports failure. Manual review required."
            )

        if nchl_status == "FAILED" and sosys_status == "SUCCESS":
            return ReconciliationResult.INVESTIGATION_REQUIRED, (
                "NCHL reports failure but SOSYS confirms settlement. Risk of double payment — freeze immediately."
            )

        if nchl_status == "FAILED" and not sosys_status:
            return ReconciliationResult.STATUS_MISMATCH, (
                "NCHL reports failure and SOSYS has no record."
            )

        return ReconciliationResult.STATUS_MISMATCH, (
            f"Unhandled state: NCHL={nchl_status}, SOSYS={sosys_status}."
        )

    def _build_summary(self, records: list) -> ReconciliationSummary:
        counts = {v: 0 for v in ReconciliationResult.values}
        for rec in records:
            counts[rec.result] = counts.get(rec.result, 0) + 1
        return ReconciliationSummary(
            total_claims           = len(records),
            matched                = counts.get(ReconciliationResult.MATCHED, 0),
            settlement_pending     = counts.get(ReconciliationResult.SETTLEMENT_PENDING, 0),
            status_mismatch        = counts.get(ReconciliationResult.STATUS_MISMATCH, 0),
            investigation_required = counts.get(ReconciliationResult.INVESTIGATION_REQUIRED, 0),
            amount_mismatch        = counts.get(ReconciliationResult.AMOUNT_MISMATCH, 0),
            not_sent               = counts.get(ReconciliationResult.NOT_SENT, 0),
            results                = records,
        )
