from decimal import Decimal
from django.db.models import Count, Sum, Q
from ..models import FHIRClaim, PaymentBatch, PaymentItem, ReconciliationRecord, ReconciliationResult


class DashboardQueries:
    def summary(self) -> dict:
        # Total claims from FHIR cache (the real source of truth)
        total_fhir = FHIRClaim.objects.count()

        recon_agg = ReconciliationRecord.objects.aggregate(
            total=Count("id"),
            matched=Count("id", filter=Q(result=ReconciliationResult.MATCHED)),
            pending=Count("id", filter=Q(result=ReconciliationResult.SETTLEMENT_PENDING)),
            mismatch=Count("id", filter=Q(result=ReconciliationResult.AMOUNT_MISMATCH)),
        )

        failed_results = [
            ReconciliationResult.STATUS_MISMATCH,
            ReconciliationResult.INVESTIGATION_REQUIRED,
            ReconciliationResult.AMOUNT_MISMATCH,
            ReconciliationResult.NOT_SENT,
        ]
        failed_count = ReconciliationRecord.objects.filter(result__in=failed_results).count()

        item_agg = PaymentItem.objects.aggregate(total_amount=Sum("amount"))
        total_amount = item_agg["total_amount"] or Decimal("0")

        batched_count   = PaymentItem.objects.values("claim_id").distinct().count()
        retry_count     = PaymentBatch.objects.filter(parent_batch__isnull=False).count()
        pending_batches = PaymentBatch.objects.filter(status="PENDING").count()

        matched = recon_agg["matched"] or 0
        reconciled = recon_agg["total"] or 0
        rate = round((matched / reconciled * 100), 2) if reconciled > 0 else 0.0

        return {
            "total_claims":       total_fhir,     # all FHIR claims synced
            "batched_claims":     batched_count,   # claims added to payment batches
            "reconciled_claims":  reconciled,      # claims with a reconciliation result
            "total_amount":       total_amount,
            "successful_payments": matched,
            "failed_payments":    failed_count,
            "pending_settlements": recon_agg["pending"] or 0,
            "amount_mismatches":  recon_agg["mismatch"] or 0,
            "retry_count":        retry_count,
            "pending_batches":    pending_batches,
            "reconciliation_rate": rate,
        }
