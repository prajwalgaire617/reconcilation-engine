from django.apps import AppConfig


class ReconciliationConfig(AppConfig):
    name = "reconciliation"
    verbose_name = "SSF Payment Reconciliation"

    def ready(self):
        pass
