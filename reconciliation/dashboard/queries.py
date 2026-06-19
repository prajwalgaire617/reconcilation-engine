from decimal import Decimal
from django.db.models import Count, Sum, Q
from ..models import PaymentBatch, PaymentItem, ReconciliationRecord, ReconciliationResult


class DashboardQueries:
    def summary(self) -> dict:
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

        item_agg = PaymentItem.objects.aggregate(
            total_amount=Sum("amount"),
        )
        total_amount = item_agg["total_amount"] or Decimal("0")

        retry_count = PaymentBatch.objects.filter(parent_batch__isnull=False).count()

        total = recon_agg["total"] or 0
        matched = recon_agg["matched"] or 0
        rate = round((matched / total * 100), 2) if total > 0 else 0.0

        return {
            "total_claims": total,
            "total_amount": total_amount,
            "successful_payments": matched,
            "failed_payments": failed_count,
            "pending_settlements": recon_agg["pending"] or 0,
            "amount_mismatches": recon_agg["mismatch"] or 0,
            "retry_count": retry_count,
            "reconciliation_rate": rate,
        }
