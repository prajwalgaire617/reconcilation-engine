import uuid
from rest_framework import status
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ..dashboard.queries import DashboardQueries
from ..repositories.payment_repository import BankStatementRepository
from ..services.reconciliation_service import ReconciliationService
from ..services.retry_service import RetryService
from ..services.statement_parser import StatementParser
from .serializers import (
    BankStatementRowSerializer,
    DashboardSerializer,
    ReconciliationRecordSerializer,
    RetryBatchSerializer,
    RunReconciliationSerializer,
)


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

        service = ReconciliationService()
        summary = service.run(claim_ids=claim_ids)

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
    """POST /statements/upload  (multipart, field: file, type: csv|pdf)"""
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

        repo = BankStatementRepository()
        created = repo.bulk_create(row_dicts, import_batch)

        return Response(
            {"import_batch": import_batch, "rows_imported": len(created)},
            status=status.HTTP_201_CREATED,
        )


class ReconciliationResultsView(APIView):
    """GET /reconciliation/results"""

    def get(self, request):
        from ..repositories.reconciliation_repository import ReconciliationRepository
        records = ReconciliationRepository().get_all()
        ser = ReconciliationRecordSerializer(records, many=True)
        return Response(ser.data)


class ReconciliationFailedView(APIView):
    """GET /reconciliation/failed"""

    def get(self, request):
        from ..repositories.reconciliation_repository import ReconciliationRepository
        records = ReconciliationRepository().get_failed()
        ser = ReconciliationRecordSerializer(records, many=True)
        return Response(ser.data)


class DashboardSummaryView(APIView):
    """GET /dashboard/summary"""

    def get(self, request):
        data = DashboardQueries().summary()
        ser = DashboardSerializer(data)
        return Response(ser.data)


class RetryBatchView(APIView):
    """POST /batch/retry"""

    def post(self, request):
        ser = RetryBatchSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        batch_id = ser.validated_data["batch_id"]

        try:
            result = RetryService().create_retry_batch(batch_id)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {
                "retry_batch_id": result.retry_batch_id,
                "retry_batch_number": result.retry_batch_number,
                "retried_claim_ids": result.retried_claim_ids,
            },
            status=status.HTTP_201_CREATED,
        )
