from ..repositories.ops_repository import OpsRepository


class DashboardQueries:
    """
    DashboardQueries — thin shim keeping backward compatibility for views/dashboard components.
    Delegates database aggregations to OpsRepository.
    """
    def summary(self, months: int = 0) -> dict:
        return OpsRepository().get_dashboard_summary_metrics(months)
