import uuid
from datetime import date
from decimal import Decimal
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..dashboard.queries import DashboardQueries
from ..repositories.payment_repository import BankStatementRepository, BatchRepository
from ..repositories.reconciliation_repository import ReconciliationRepository
from ..repositories.claim_repository import ClaimRepository
from ..services.claim_service import ClaimService
from ..services.batch_create_service import BatchCreateService
from ..services.queue_service import QueueService
from ..services.reconciliation_service import ReconciliationService
from ..services.retry_service import RetryService
from ..services.ops_service import OpsService
from ..services.statement_parser import StatementParser

from .serializers import (
    BankStatementRowSerializer,
    DashboardSerializer,
    ReconciliationRecordSerializer,
    RetryBatchSerializer,
    RunReconciliationSerializer,
)


class FHIRClaimFetchView(APIView):
    """POST /claims/fetch — trigger a FHIR sync."""
    def post(self, request):
        from ..dtos.claim import FetchClaimsCommand
        months = int(request.data.get("months", 3))
        try:
            result = ClaimService().sync_fhir(FetchClaimsCommand(months=months))
        except ConnectionError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        return Response({
            "fetched": result.fetched,
            "created": result.created,
            "updated": result.updated,
            "skipped": result.skipped,
        }, status=status.HTTP_200_OK)


class FHIRClaimListView(APIView):
    """GET /claims/ — list cached FHIR claims with optional filters."""
    PAYMENT_STATUSES = {"PENDING", "DONE", "ERROR", "BATCHED", "SUBMITTED"}

    def get(self, request):
        from ..dtos.claim import ClaimListQuery
        status_param = request.query_params.get("status", "")
        payment_status_filter = status_param if status_param in self.PAYMENT_STATUSES else None
        fhir_status_filter = None if payment_status_filter else (status_param or None)

        months_raw = request.query_params.get("months", "0")
        months_val = int(months_raw) if months_raw.isdigit() else 0
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))

        query = ClaimListQuery(
            hospital_id=request.query_params.get("hospital_id"),
            status=fhir_status_filter,
            payment_status=payment_status_filter,
            months=months_val or None,
            page=page,
            page_size=page_size,
        )

        page_dto = ClaimService().list_claims(query)
        return Response({
            "last_sync": page_dto.last_sync.isoformat() if page_dto.last_sync else None,
            "count": page_dto.count,
            "page": page_dto.page,
            "page_size": page_dto.page_size,
            "total_pages": page_dto.total_pages,
            "claims": [
                {
                    "id": c.id,
                    "fhir_id": c.fhir_id,
                    "claim_reference": c.claim_reference,
                    "patient_name": c.patient_name,
                    "hospital_id": c.hospital_id,
                    "hospital_name": c.hospital_name,
                    "amount": str(c.amount),
                    "currency": c.currency,
                    "fhir_status": c.fhir_status,
                    "service_date": str(c.service_date) if c.service_date else None,
                    "last_synced": c.last_synced.isoformat() if c.last_synced else None,
                    "payment_status": c.payment_status,
                }
                for c in page_dto.claims
            ],
        })


class HospitalListView(APIView):
    """GET /claims/hospitals/ — distinct hospitals from cached claims."""
    def get(self, request):
        hospitals = ClaimService().list_hospitals()
        # Deduplicate
        seen = {}
        for h in hospitals:
            if h.hospital_id not in seen:
                seen[h.hospital_id] = {
                    "hospital_id": h.hospital_id,
                    "hospital_name": h.hospital_name,
                    "claim_count": h.claim_count,
                    "total_amount": str(h.total_amount),
                }
        return Response(list(seen.values()))


class BatchCreateView(APIView):
    """
    POST /batch/create
    Body: { claim_ids, batch_size?, submit_now? }
    """
    def post(self, request):
        claim_ids  = request.data.get("claim_ids", [])
        batch_size = request.data.get("batch_size")
        submit_now = request.data.get("submit_now", True)
        if not claim_ids:
            return Response({"error": "claim_ids list is required."}, status=status.HTTP_400_BAD_REQUEST)
        
        from ..dtos.batch import CreateBatchCommand
        try:
            cmd = CreateBatchCommand(
                claim_ids=claim_ids,
                batch_size=int(batch_size) if batch_size else None,
                submit_now=bool(submit_now),
            )
            summary = BatchCreateService().create_batch(cmd)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "total_batches": summary.batches_created,
            "submitted": summary.submitted,
            "failed": sum(1 for b in summary.batches if b.status == "FAILED"),
            "batches": [
                {
                    "hospital_id":    b.hospital_id,
                    "hospital_name":  b.hospital_name,
                    "batch_id":       b.batch_id,
                    "batch_number":   b.batch_number,
                    "claim_count":    b.claim_count,
                    "total_amount":   str(b.total_amount),
                    "status":         b.status,
                    "failure_reason": b.failure_reason,
                }
                for b in summary.batches
            ],
        }, status=status.HTTP_201_CREATED)


# ── Payment Queue Views ────────────────────────────────────────────────────────

class QueueListView(APIView):
    """GET /queue/ — list the payment queue in FIFO order."""
    def get(self, request):
        queue = QueueService().get_queue()
        data = [
            {
                "id":           e.id,
                "position":     e.position,
                "batch_id":     e.batch_id,
                "batch_number": e.batch_number,
                "hospital":     e.hospital_name,
                "hospital_id":  e.hospital_id,
                "claim_count":  e.claim_count,
                "total_amount": str(e.total_amount),
                "batch_status": e.status,
                "scheduled_at": e.scheduled_at.isoformat(),
                "status":       e.status,
                "executed_at":  e.executed_at.isoformat() if e.executed_at else None,
                "notes":        e.notes,
                "created_at":   e.created_at.isoformat(),
            }
            for e in queue
        ]
        return Response({"count": len(data), "queue": data})


class QueueEnqueueView(APIView):
    """POST /queue/add — add batches to the queue."""
    def post(self, request):
        batch_ids    = request.data.get("batch_ids", [])
        scheduled_at = request.data.get("scheduled_at")
        if not batch_ids or not scheduled_at:
            return Response({"error": "batch_ids and scheduled_at are required."}, status=status.HTTP_400_BAD_REQUEST)
        
        from django.utils.dateparse import parse_datetime
        from django.utils import timezone
        dt = parse_datetime(scheduled_at)
        if not dt:
            return Response({"error": "Invalid scheduled_at format. Use ISO 8601."}, status=status.HTTP_400_BAD_REQUEST)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt)

        try:
            result = QueueService().enqueue(batch_ids, dt)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"queued": result.total_queued}, status=status.HTTP_201_CREATED)


class QueueExecuteView(APIView):
    """POST /queue/execute — run all QUEUED entries that are due now."""
    def post(self, request):
        result = QueueService().execute_due()
        return Response({
            "executed": result.executed,
            "skipped":  result.skipped,
            "errors":   result.errors,
        })


class QueueCancelView(APIView):
    """POST /queue/{id}/cancel"""
    def post(self, request, queue_id):
        try:
            QueueService().cancel(queue_id)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"cancelled": queue_id})


class QueueMoveView(APIView):
    """POST /queue/{id}/move  body: { direction: "up"|"down" }"""
    def post(self, request, queue_id):
        direction = request.data.get("direction", "down")
        try:
            QueueService().move(queue_id, direction)
        except Exception as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"moved": queue_id, "direction": direction})


class StatementPreviewView(APIView):
    """POST /statements/preview — parse a PDF/CSV and return fields without saving."""
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        file_type = request.data.get("type", "pdf").lower()
        parser = StatementParser()

        try:
            if file_type == "pdf":
                data = parser.preview_pdf(uploaded)
            else:
                rows = parser.parse_csv(uploaded)
                data = {
                    "format": "csv",
                    "rows": [
                        {
                            "claim_id": r.claim_id,
                            "transaction_id": r.transaction_id,
                            "amount": str(r.amount),
                            "status": r.status,
                            "settlement_date": str(r.settlement_date),
                        }
                        for r in rows
                    ],
                }
        except (ValueError, ImportError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(data, status=status.HTTP_200_OK)


class RunReconciliationView(APIView):
    """POST /reconciliation/run"""
    def post(self, request):
        ser = RunReconciliationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        claim_ids = ser.validated_data.get("claim_ids")

        summary = ReconciliationService().run(claim_ids=claim_ids)

        return Response(
            {
                "total_claims": summary.total_claims,
                "matched": summary.matched,
                "settlement_pending": summary.settlement_pending,
                "status_mismatch": summary.status_mismatch,
                "investigation_required": summary.investigation_required,
                "amount_mismatch": summary.amount_mismatch,
                "not_sent": summary.not_sent,
            },
            status=status.HTTP_200_OK,
        )


class StatementUploadView(APIView):
    """POST /statements/upload"""
    parser_classes = [MultiPartParser]

    def post(self, request):
        uploaded = request.FILES.get("file")
        if not uploaded:
            return Response({"error": "No file provided."}, status=status.HTTP_400_BAD_REQUEST)

        file_type = request.data.get("type", "csv").lower()
        claim_id_raw = request.data.get("claim_id", "").strip()
        claim_id = int(claim_id_raw) if claim_id_raw.isdigit() else None
        parser = StatementParser()

        try:
            if file_type == "pdf":
                rows = parser.parse_pdf(uploaded, claim_id=claim_id)
            else:
                rows = parser.parse_csv(uploaded)
        except (ValueError, ImportError) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        import_batch = f"IMPORT-{uuid.uuid4().hex[:8].upper()}"
        row_dicts = [
            {
                "claim_id": r.claim_id,
                "transaction_id": r.transaction_id,
                "amount": r.amount,
                "status": r.status,
                "settlement_date": r.settlement_date,
            }
            for r in rows
        ]

        created = BankStatementRepository().bulk_create(row_dicts, import_batch)
        return Response(
            {"import_batch": import_batch, "rows_imported": len(created)},
            status=status.HTTP_201_CREATED,
        )


class ReconciliationResultsView(APIView):
    """GET /reconciliation/results"""
    def get(self, request):
        records = ReconciliationRepository().list_all()
        return Response([
            {
                "id": r.id,
                "claim_id": r.claim_id,
                "gateway_status": r.gateway_status,
                "bank_status": r.bank_status,
                "gateway_amount": str(r.gateway_amount) if r.gateway_amount is not None else None,
                "bank_amount": str(r.bank_amount) if r.bank_amount is not None else None,
                "result": r.result,
                "reason": r.reason,
                "created_at": r.created_at.isoformat(),
                "batch_id": r.batch_id,
            }
            for r in records
        ])


class ReconciliationFailedView(APIView):
    """GET /reconciliation/failed"""
    def get(self, request):
        records = ReconciliationRepository().list_failed()
        return Response([
            {
                "id": r.id,
                "claim_id": r.claim_id,
                "gateway_status": r.gateway_status,
                "bank_status": r.bank_status,
                "gateway_amount": str(r.gateway_amount) if r.gateway_amount is not None else None,
                "bank_amount": str(r.bank_amount) if r.bank_amount is not None else None,
                "result": r.result,
                "reason": r.reason,
                "created_at": r.created_at.isoformat(),
                "batch_id": r.batch_id,
            }
            for r in records
        ])


class DashboardSummaryView(APIView):
    """GET /dashboard/summary"""
    def get(self, request):
        months_raw = request.query_params.get("months", "0")
        months_val = int(months_raw) if months_raw.isdigit() else 0
        data = DashboardQueries().summary(months=months_val)
        ser = DashboardSerializer(data)
        return Response(ser.data)


class BatchListView(APIView):
    """GET /batch/ — list all payment batches."""
    def get(self, request):
        batches = BatchRepository().list_batches()
        data = [
            {
                "id":            b.id,
                "batch_number":  b.batch_number,
                "hospital_id":   b.hospital_id,
                "hospital_name": b.hospital_name,
                "status":        b.status,
                "claim_count":   b.claim_count,
                "total_amount":  str(b.total_amount),
                "created_at":    b.created_at.isoformat(),
                "in_queue":      b.in_queue,
            }
            for b in batches
        ]
        return Response({"count": len(data), "batches": data})


class BatchDetailView(APIView):
    """GET /batch/{id}/ — batch header + all claims with their payment_status."""
    def get(self, request, batch_id):
        batch = BatchRepository().get_batch_detail(batch_id)
        if not batch:
            return Response({"error": "Batch not found."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "id":             batch.id,
            "batch_number":   batch.batch_number,
            "hospital_id":    batch.hospital_id,
            "hospital_name":  batch.hospital_name,
            "status":         batch.status,
            "can_resubmit":   batch.can_resubmit,
            "created_at":     batch.created_at.isoformat(),
            "claim_count":    batch.claim_count,
            "total_amount":   str(batch.total_amount),
            "claims": [
                {
                    "claim_id":          c.claim_id,
                    "patient_name":      c.patient_name,
                    "hospital_name":     c.hospital_name,
                    "amount":            str(c.amount),
                    "gateway_status":    c.status,
                    "gateway_reference": c.gateway_reference,
                    "payment_status":    c.payment_status,
                    "recon_result":      c.recon_result,
                }
                for c in batch.items
            ],
        })


class BatchAutoCreateView(APIView):
    """
    POST /batch/auto-create
    """
    def post(self, request):
        batch_size = int(request.data.get("batch_size", 15))
        submit_now = bool(request.data.get("submit_now", False))

        # Find claim_ids already in a batch
        # We can queries this through the repositories to be clean
        batches = BatchRepository().list_batches()
        batched_ids = set()
        for b in batches:
            detail = BatchRepository().get_batch_detail(b.id)
            if detail:
                for item in detail.items:
                    batched_ids.add(item.claim_id)

        all_claims = ClaimRepository().list_claims()
        unbatched = [
            c for c in all_claims
            if c.fhir_id.isdigit() and int(c.fhir_id) not in batched_ids
        ]
        if not unbatched:
            return Response({"message": "All claims are already batched.", "total_batches": 0, "batches": []})

        db_ids = [c.id for c in unbatched if c.id is not None]

        from ..dtos.batch import CreateBatchCommand
        try:
            cmd = CreateBatchCommand(
                claim_ids=db_ids,
                batch_size=batch_size,
                submit_now=submit_now,
            )
            summary = BatchCreateService().create_batch(cmd)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "total_batches": summary.batches_created,
            "submitted":     summary.submitted,
            "failed":        sum(1 for b in summary.batches if b.status == "FAILED"),
            "unbatched_claims": len(unbatched),
            "batches": [
                {
                    "hospital_id":   b.hospital_id,
                    "hospital_name": b.hospital_name,
                    "batch_id":      b.batch_id,
                    "batch_number":  b.batch_number,
                    "claim_count":   b.claim_count,
                    "total_amount":  str(b.total_amount),
                    "status":        b.status,
                }
                for b in summary.batches
            ],
        }, status=status.HTTP_201_CREATED)


class RetryBatchView(APIView):
    """POST /batch/retry"""
    def post(self, request):
        ser = RetryBatchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        batch_id = ser.validated_data["batch_id"]

        try:
            # Attempt to delegate to background Celery task
            from ..tasks.payment_tasks import retry_batch_task
            task_result = retry_batch_task.delay(batch_id)
            return Response({
                "task_id": task_result.id,
                "status": "pending",
                "message": "Retry batch creation task dispatched asynchronously."
            }, status=status.HTTP_202_ACCEPTED)
        except Exception as exc:
            # Fall back to synchronous execution
            try:
                result = RetryService().create_retry_batch(batch_id)
                return Response(result.to_dict(), status=status.HTTP_201_CREATED)
            except ValueError as exc_val:
                return Response({"error": str(exc_val)}, status=status.HTTP_400_BAD_REQUEST)


# ── Operations Center Views ───────────────────────────────────────────────────

class OpsSummaryView(APIView):
    """GET /ops/summary"""
    def get(self, request):
        dto = OpsService().get_summary()
        return Response({
            "total_reconciled":     dto.total_reconciled,
            "amount_settled_today": str(dto.amount_settled_today),
            "pending_settlement":   str(dto.pending_settlement),
            "failed_payments":      dto.failed_payments,
            "review_required":      dto.review_required,
            "money_at_risk":        str(dto.money_at_risk),
            "unreconciled_amount":  str(dto.unreconciled_amount),
            "batches_today":        dto.batches_today,
            "action_queue": [
                {
                    "claim_id":       a.claim_id,
                    "provider":       a.hospital_name,
                    "beneficiary":    a.patient_name,
                    "amount":         str(a.amount),
                    "gateway_status": a.status, # matches UI expected keys
                    "sosys_status":   "",
                    "result":         a.status,
                    "priority":       a.priority,
                    "detected_at":    a.detected_at.isoformat(),
                    "recon_id":       a.claim_id,
                }
                for a in dto.action_queue
            ],
        })


class OpsActivityView(APIView):
    """GET /ops/activity"""
    def get(self, request):
        dto = OpsService().get_activity()
        return Response({
            "events": [
                {
                    "type": ev.type,
                    "ts": ev.ts.isoformat(),
                    "description": ev.description,
                    "ref": ev.ref,
                    "severity": ev.severity,
                }
                for ev in dto.events
            ]
        })


class ClaimTimelineView(APIView):
    """GET /claim/{claim_id}/timeline"""
    def get(self, request, claim_id):
        timeline = OpsService().get_claim_timeline(claim_id)
        return Response(timeline)


class ExceptionListView(APIView):
    """GET /exceptions/"""
    def get(self, request):
        t = request.query_params.get("type", "")
        dto = OpsService().get_exceptions(exception_type=t)
        return Response({
            "count": dto.count,
            "summary": dto.summary,
            "exceptions": [
                {
                    "id":         index, # client expected exception unique ID
                    "claim_id":   ex.claim_id,
                    "provider":   ex.provider,
                    "beneficiary": ex.beneficiary,
                    "amount":     str(ex.amount),
                    "exception_type": ex.exception_type,
                    "label":      ex.exception_type.replace('_', ' ').title(),
                    "severity":   ex.severity,
                    "gateway_status": "",
                    "sosys_status": "",
                    "reason":     "",
                    "detected_at": ex.detected_at.isoformat(),
                }
                for index, ex in enumerate(dto.exceptions, start=1)
            ]
        })
