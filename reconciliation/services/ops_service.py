from datetime import datetime, timedelta
from typing import List, Optional
from django.utils.timezone import now as tz_now

from ..repositories.base import AbstractOpsRepository
from ..repositories.ops_repository import OpsRepository
from ..dtos.ops import ActionItemDTO, ActivityEventDTO, OpsSummaryDTO, OpsActivityDTO, ExceptionItemDTO, ExceptionListDTO


class OpsService:
    """
    Service layer coordinator for the Operations Center.
    Enforces business logic, coordinates repositories, and returns DTOs.
    """
    def __init__(self, ops_repo: Optional[AbstractOpsRepository] = None):
        self._ops = ops_repo or OpsRepository()

    def get_summary(self) -> OpsSummaryDTO:
        metrics = self._ops.get_ops_summary_metrics()
        action_queue_raw = self._ops.get_action_queue()
        
        action_queue = [
            ActionItemDTO(
                claim_id=r["claim_id"],
                patient_name=r["beneficiary"],
                hospital_name=r["provider"],
                amount=r["amount"],
                status=r["result"],
                reason=r.get("reason", "") or "",
                priority=r["priority"],
                detected_at=r["detected_at"],
            )
            for r in action_queue_raw
        ]

        return OpsSummaryDTO(
            total_reconciled=metrics["total_reconciled"],
            amount_settled_today=metrics["amount_settled_today"],
            pending_settlement=metrics["pending_settlement"],
            failed_payments=metrics["failed_payments"],
            review_required=metrics["review_required"],
            money_at_risk=metrics["money_at_risk"],
            unreconciled_amount=metrics["unreconciled_amount"],
            batches_today=metrics["batches_today"],
            action_queue=action_queue,
        )

    def get_activity(self) -> OpsActivityDTO:
        cutoff = tz_now() - timedelta(hours=48)
        events_raw = self._ops.get_ops_activities(cutoff)
        
        events = [
            ActivityEventDTO(
                type=e["type"],
                ts=e["ts"],
                description=e["description"],
                ref=e["ref"],
                severity=e["severity"],
            )
            for e in events_raw
        ]
        events.sort(key=lambda x: x.ts, reverse=True)
        return OpsActivityDTO(events=events[:30])

    def get_claim_timeline(self, claim_id: int) -> dict:
        from ..repositories.claim_repository import ClaimRepository
        claim_repo = ClaimRepository()
        claims = claim_repo.get_by_fhir_ids([str(claim_id)])
        fhir = claims[0] if claims else None

        events_raw = self._ops.get_claim_timeline_events(claim_id)
        events_raw.sort(key=lambda x: x["ts"])
        
        from ..repositories.reconciliation_repository import ReconciliationRepository
        recon_repo = ReconciliationRepository()
        latest_recon_map = recon_repo.get_status_map([claim_id])
        latest_item_map = recon_repo.get_item_status_map([claim_id])
        
        latest_recon = latest_recon_map.get(claim_id)
        latest_item = latest_item_map.get(claim_id)
        current_status = latest_recon if latest_recon else (latest_item if latest_item else "PENDING")

        return {
            "claim_id": claim_id,
            "patient_name": fhir.patient_name if fhir else None,
            "provider": fhir.hospital_name if fhir else None,
            "amount": str(fhir.amount) if fhir else None,
            "current_status": current_status,
            "events": [
                {
                    "ts": ev["ts"].isoformat(),
                    "event": ev["event"],
                    "title": ev["title"],
                    "detail": ev["detail"],
                    "status": ev["status"],
                    "meta": ev["meta"],
                }
                for ev in events_raw
            ]
        }

    def get_exceptions(self, exception_type: Optional[str] = None) -> ExceptionListDTO:
        exceptions_raw = self._ops.get_exceptions_list(exception_type)
        
        exceptions = [
            ExceptionItemDTO(
                claim_id=r["claim_id"],
                exception_type=r["exception_type"],
                severity=r["severity"],
                detected_at=r["detected_at"],
                provider=r["provider"],
                beneficiary=r["beneficiary"],
                amount=r["amount"],
            )
            for r in exceptions_raw
        ]
        
        summary = {}
        for item in exceptions:
            summary[item.exception_type] = summary.get(item.exception_type, 0) + 1
            
        return ExceptionListDTO(
            count=len(exceptions),
            summary=summary,
            exceptions=exceptions,
        )
