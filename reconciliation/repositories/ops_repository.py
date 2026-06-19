from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from django.db.models import Count, Sum, Q

from .base import AbstractOpsRepository
from ..models import FHIRClaim, PaymentBatch, PaymentItem, ReconciliationRecord, PaymentQueue, SOSYSPaymentLog


class OpsRepository(AbstractOpsRepository):
    """
    Concrete implementation of operations database aggregation queries.
    """
    def get_dashboard_summary_metrics(self, months: int) -> dict:
        since = (date.today() - timedelta(days=months * 30)) if months else None

        fhir_qs = FHIRClaim.objects.all()
        if since:
            fhir_qs = fhir_qs.filter(service_date__gte=since)
        total_fhir = fhir_qs.count()

        recon_qs = ReconciliationRecord.objects.all()
        if since:
            recon_qs = recon_qs.filter(created_at__date__gte=since)

        recon_agg = recon_qs.aggregate(
            total=Count("id"),
            matched=Count("id", filter=Q(result="MATCHED")),
            pending=Count("id", filter=Q(result="SETTLEMENT_PENDING")),
            mismatch=Count("id", filter=Q(result="AMOUNT_MISMATCH")),
        )

        failed_results = [
            "STATUS_MISMATCH",
            "INVESTIGATION_REQUIRED",
            "AMOUNT_MISMATCH",
            "NOT_SENT",
        ]
        failed_count = recon_qs.filter(result__in=failed_results).count()

        item_qs = PaymentItem.objects.all()
        if since:
            item_qs = item_qs.filter(created_at__date__gte=since)

        item_agg = item_qs.aggregate(total_amount=Sum("amount"))
        total_amount = item_agg["total_amount"] or Decimal("0")
        batched_count = item_qs.values("claim_id").distinct().count()

        batch_qs = PaymentBatch.objects.filter(parent_batch__isnull=True)
        if since:
            batch_qs = batch_qs.filter(created_at__date__gte=since)
        retry_count = PaymentBatch.objects.filter(parent_batch__isnull=False).count()
        pending_batches = batch_qs.filter(status="PENDING").count()

        matched = recon_agg["matched"] or 0
        reconciled = recon_agg["total"] or 0
        rate = round((matched / reconciled * 100), 2) if reconciled > 0 else 0.0

        return {
            "total_claims": total_fhir,
            "batched_claims": batched_count,
            "reconciled_claims": reconciled,
            "total_amount": total_amount,
            "successful_payments": matched,
            "failed_payments": failed_count,
            "pending_settlements": recon_agg["pending"] or 0,
            "amount_mismatches": recon_agg["mismatch"] or 0,
            "retry_count": retry_count,
            "pending_batches": pending_batches,
            "reconciliation_rate": rate,
            "months_filter": months,
        }

    def get_ops_summary_metrics(self) -> dict:
        today = date.today()
        ERROR_RESULTS  = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}
        REVIEW_RESULTS = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH"}

        total_recon = ReconciliationRecord.objects.count()
        today_matched = ReconciliationRecord.objects.filter(result="MATCHED", created_at__date=today)
        amount_settled = today_matched.aggregate(s=Sum("gateway_amount"))["s"] or Decimal("0")
        
        matched_ids = set(ReconciliationRecord.objects.filter(result="MATCHED").values_list("claim_id", flat=True))
        pending_amt = PaymentItem.objects.filter(status="SUCCESS").exclude(claim_id__in=matched_ids).aggregate(s=Sum("amount"))["s"] or Decimal("0")
        
        failed_count = ReconciliationRecord.objects.filter(result__in=ERROR_RESULTS).count()
        review_count = ReconciliationRecord.objects.filter(result__in=REVIEW_RESULTS).count()
        risk_amt = ReconciliationRecord.objects.filter(result__in={"STATUS_MISMATCH", "INVESTIGATION_REQUIRED"}).aggregate(s=Sum("gateway_amount"))["s"] or Decimal("0")
        
        total_pi_amt = PaymentItem.objects.aggregate(s=Sum("amount"))["s"] or Decimal("0")
        matched_amt = ReconciliationRecord.objects.filter(result="MATCHED").aggregate(s=Sum("gateway_amount"))["s"] or Decimal("0")
        unreconciled_amt = total_pi_amt - matched_amt
        batches_today = PaymentBatch.objects.filter(created_at__date=today).count()

        return {
            "total_reconciled": total_recon,
            "amount_settled_today": amount_settled,
            "pending_settlement": pending_amt,
            "failed_payments": failed_count,
            "review_required": review_count,
            "money_at_risk": risk_amt,
            "unreconciled_amount": unreconciled_amt,
            "batches_today": batches_today,
        }

    def get_action_queue(self) -> List[dict]:
        ERROR_RESULTS  = {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}
        action_records = list(
            ReconciliationRecord.objects.filter(result__in=ERROR_RESULTS | {"SETTLEMENT_PENDING"})
            .order_by("-created_at")[:50]
        )
        claim_ids = [r.claim_id for r in action_records]
        fhir_map  = {int(c.fhir_id): c for c in FHIRClaim.objects.filter(fhir_id__in=[str(x) for x in claim_ids]) if c.fhir_id.isdigit()}

        PRIORITY = {
            "INVESTIGATION_REQUIRED": "CRITICAL",
            "STATUS_MISMATCH": "HIGH",
            "AMOUNT_MISMATCH": "MEDIUM",
            "NOT_SENT": "MEDIUM",
            "SETTLEMENT_PENDING": "LOW",
        }

        queue = []
        for r in action_records:
            fhir = fhir_map.get(r.claim_id)
            queue.append({
                "claim_id": r.claim_id,
                "provider": fhir.hospital_name if fhir else "—",
                "beneficiary": fhir.patient_name if fhir else "—",
                "amount": r.gateway_amount or Decimal("0"),
                "gateway_status": r.gateway_status,
                "sosys_status": r.bank_status,
                "result": r.result,
                "priority": PRIORITY.get(r.result, "LOW"),
                "detected_at": r.created_at,
                "recon_id": r.id,
            })
        return queue

    def get_ops_activities(self, cutoff: datetime) -> List[dict]:
        events = []
        for b in PaymentBatch.objects.filter(status__in=["SUBMITTED", "COMPLETED"], created_at__gte=cutoff).order_by("-created_at")[:15]:
            events.append({
                "type": "BATCH_SUBMITTED",
                "ts": b.created_at,
                "description": f"Batch {b.batch_number} submitted ({b.items.count()} claims)",
                "ref": str(b.id),
                "severity": "info"
            })
        for r in ReconciliationRecord.objects.filter(created_at__gte=cutoff).order_by("-created_at")[:25]:
            if r.result == "MATCHED":
                events.append({
                    "type": "CLAIM_RECONCILED",
                    "ts": r.created_at,
                    "description": f"Claim {r.claim_id} reconciled — MATCHED",
                    "ref": str(r.claim_id),
                    "severity": "success"
                })
            elif r.result in {"STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"}:
                events.append({
                    "type": "MISMATCH_DETECTED",
                    "ts": r.created_at,
                    "description": f"Claim {r.claim_id}: {r.result.replace('_', ' ')}",
                    "ref": str(r.claim_id),
                    "severity": "error"
                })
        for q in PaymentQueue.objects.filter(status="COMPLETED", executed_at__gte=cutoff).order_by("-executed_at")[:10]:
            events.append({
                "type": "QUEUE_EXECUTED",
                "ts": q.executed_at,
                "description": f"Queue #{q.id} executed — {q.batch.batch_number}",
                "ref": str(q.id),
                "severity": "info"
            })
        return events

    def get_claim_timeline_events(self, claim_id: int) -> List[dict]:
        events = []
        fhir = FHIRClaim.objects.filter(fhir_id=str(claim_id)).first()
        if fhir and fhir.last_synced:
            events.append({
                "ts": fhir.last_synced,
                "event": "FHIR_SYNCED",
                "title": "Claim Synced from FHIR",
                "detail": f"{fhir.hospital_name} · NPR {fhir.amount} · {fhir.patient_name or '—'}",
                "status": "ok",
                "meta": {"fhir_id": fhir.fhir_id}
            })
        for item in PaymentItem.objects.filter(claim_id=claim_id).order_by("created_at"):
            try:
                b = item.batch
                events.append({
                    "ts": item.created_at,
                    "event": "BATCH_CREATED",
                    "title": "Added to Payment Batch",
                    "detail": f"Batch {b.batch_number} · {b.hospital_name or b.hospital_id}",
                    "status": "ok",
                    "meta": {"batch_number": b.batch_number}
                })
                if b.status in ("SUBMITTED", "COMPLETED"):
                    events.append({
                        "ts": b.created_at,
                        "event": "GATEWAY_SUBMITTED",
                        "title": "Submitted to NCHL Gateway",
                        "detail": f"Batch {b.batch_number}",
                        "status": "ok",
                        "meta": {}
                    })
            except Exception:
                pass
            if item.status == "SUCCESS":
                events.append({
                    "ts": item.created_at,
                    "event": "GATEWAY_ACCEPTED",
                    "title": "Gateway Accepted",
                    "detail": f"Ref: {item.gateway_reference or '—'} · NPR {item.amount}",
                    "status": "ok",
                    "meta": {"ref": item.gateway_reference}
                })
            elif item.status == "FAILED":
                events.append({
                    "ts": item.created_at,
                    "event": "GATEWAY_FAILED",
                    "title": "Gateway Rejected",
                    "detail": f"NCHL rejected NPR {item.amount}",
                    "status": "error",
                    "meta": {}
                })
        for log in SOSYSPaymentLog.objects.filter(claim_id=claim_id).order_by("created_at"):
            events.append({
                "ts": log.created_at,
                "event": "SOSYS_LOGGED",
                "title": "SOSYS Confirmation",
                "detail": f"Status: {log.status} · NPR {log.amount or '—'}",
                "status": "ok" if log.status == "SUCCESS" else "warning",
                "meta": {"sosys_status": log.status}
            })
        for recon in ReconciliationRecord.objects.filter(claim_id=claim_id).order_by("created_at"):
            events.append({
                "ts": recon.created_at,
                "event": "RECONCILED",
                "title": f"Reconciled — {recon.result.replace('_', ' ')}",
                "detail": recon.reason or f"Gateway: {recon.gateway_status} · SOSYS: {recon.bank_status}",
                "status": "ok" if recon.result == "MATCHED" else ("warning" if recon.result == "SETTLEMENT_PENDING" else "error"),
                "meta": {
                    "result": recon.result,
                    "gateway_amount": str(recon.gateway_amount or ""),
                    "sosys_amount": str(recon.bank_amount or "")
                }
            })
        return events

    def get_exceptions_list(self, exception_type: Optional[str]) -> List[dict]:
        TYPES = {
            "AMOUNT_MISMATCH": {"label": "Amount Mismatch", "severity": "MEDIUM"},
            "STATUS_MISMATCH": {"label": "Status Mismatch", "severity": "HIGH"},
            "INVESTIGATION_REQUIRED": {"label": "Investigation Required", "severity": "CRITICAL"},
            "NOT_SENT": {"label": "Missing Settlement", "severity": "MEDIUM"},
            "SETTLEMENT_PENDING": {"label": "Settlement Delay", "severity": "LOW"},
        }
        qs = ReconciliationRecord.objects.filter(result__in=TYPES.keys())
        if exception_type and exception_type in TYPES:
            qs = qs.filter(result=exception_type)
        qs = qs.order_by("-created_at")

        ids = [r.claim_id for r in qs]
        fm = {int(c.fhir_id): c for c in FHIRClaim.objects.filter(fhir_id__in=[str(x) for x in ids]) if c.fhir_id.isdigit()}

        data = []
        for r in qs:
            f = fm.get(r.claim_id)
            ex = TYPES.get(r.result, {"label": r.result, "severity": "LOW"})
            data.append({
                "id": r.id,
                "claim_id": r.claim_id,
                "provider": f.hospital_name if f else "—",
                "beneficiary": f.patient_name if f else "—",
                "amount": r.gateway_amount or Decimal("0"),
                "exception_type": r.result,
                "label": ex["label"],
                "severity": ex["severity"],
                "gateway_status": r.gateway_status,
                "sosys_status": r.bank_status,
                "reason": r.reason,
                "detected_at": r.created_at,
            })
        return data
