from django.urls import path
from .views import (
    BatchCreateView,
    DashboardSummaryView,
    FHIRClaimFetchView,
    FHIRClaimListView,
    HospitalListView,
    ReconciliationFailedView,
    ReconciliationResultsView,
    RetryBatchView,
    RunReconciliationView,
    StatementPreviewView,
    StatementUploadView,
)

urlpatterns = [
    path("reconciliation/run", RunReconciliationView.as_view(), name="reconciliation-run"),
    path("statements/upload", StatementUploadView.as_view(), name="statements-upload"),
    path("statements/preview", StatementPreviewView.as_view(), name="statements-preview"),
    path("reconciliation/results", ReconciliationResultsView.as_view(), name="reconciliation-results"),
    path("reconciliation/failed", ReconciliationFailedView.as_view(), name="reconciliation-failed"),
    path("dashboard/summary", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("batch/retry",       RetryBatchView.as_view(),        name="batch-retry"),
    path("batch/create",      BatchCreateView.as_view(),       name="batch-create"),
    path("claims/",           FHIRClaimListView.as_view(),     name="claims-list"),
    path("claims/fetch",      FHIRClaimFetchView.as_view(),    name="claims-fetch"),
    path("claims/hospitals/", HospitalListView.as_view(),      name="claims-hospitals"),
]
