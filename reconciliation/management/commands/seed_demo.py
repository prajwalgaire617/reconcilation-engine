"""
Management command: python manage.py seed_demo

Seeds realistic demo data so you can run the reconciliation without the live gateway.
Demonstrates all reconciliation outcomes:
  MATCHED, SETTLEMENT_PENDING, STATUS_MISMATCH,
  INVESTIGATION_REQUIRED, AMOUNT_MISMATCH, NOT_SENT
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand

from reconciliation.models import (
    BankStatementRow,
    PaymentBatch,
    PaymentItem,
    ReconciliationRecord,
    SOSYSPaymentLog,
)


class Command(BaseCommand):
    help = "Seed demo data for reconciliation showcase"

    def handle(self, *args, **options):
        self._clear()
        batch = self._seed_batch()
        self._seed_sosys_logs()
        self._seed_bank_statement()
        self.stdout.write(self.style.SUCCESS(
            f"Demo data seeded. Batch: {batch.batch_number}\n"
            "Run POST /reconciliation/run to see results."
        ))

    def _clear(self):
        ReconciliationRecord.objects.all().delete()
        BankStatementRow.objects.all().delete()
        SOSYSPaymentLog.objects.all().delete()
        PaymentItem.objects.all().delete()
        PaymentBatch.objects.all().delete()

    def _seed_batch(self) -> PaymentBatch:
        batch = PaymentBatch.objects.create(batch_number="BATCH-DEMO-001", status="SUBMITTED")
        items = [
            (101, "5000.00"),   # will be MATCHED
            (102, "12500.00"),  # will be SETTLEMENT_PENDING (no bank record)
            (103, "8750.00"),   # will be STATUS_MISMATCH (gw SUCCESS, bank FAILED)
            (104, "3200.00"),   # will be INVESTIGATION_REQUIRED (gw FAILED, bank SUCCESS)
            (105, "19000.00"),  # will be AMOUNT_MISMATCH
            (106, "6400.00"),   # will be NOT_SENT (no SOSYS log)
        ]
        for claim_id, amount in items:
            PaymentItem.objects.create(
                batch=batch,
                claim_id=claim_id,
                amount=Decimal(amount),
                status="PENDING",
            )
        return batch

    def _seed_sosys_logs(self):
        today = date.today()
        logs = [
            # 101 → SUCCESS (will match bank)
            dict(claim_id=101, gateway_reference="NCHL-AA001", amount="5000.00", status="SUCCESS",
                 response_payload={"msg": "approved"}),
            # 102 → SUCCESS (no bank record → SETTLEMENT_PENDING)
            dict(claim_id=102, gateway_reference="NCHL-BB002", amount="12500.00", status="SUCCESS",
                 response_payload={"msg": "approved"}),
            # 103 → SUCCESS (bank FAILED → STATUS_MISMATCH)
            dict(claim_id=103, gateway_reference="NCHL-CC003", amount="8750.00", status="SUCCESS",
                 response_payload={"msg": "approved"}),
            # 104 → FAILED (bank SUCCESS → INVESTIGATION_REQUIRED)
            dict(claim_id=104, gateway_reference="NCHL-DD004", amount="3200.00", status="FAILED",
                 response_payload={"msg": "declined"}),
            # 105 → SUCCESS (amount differs → AMOUNT_MISMATCH)
            dict(claim_id=105, gateway_reference="NCHL-EE005", amount="19000.00", status="SUCCESS",
                 response_payload={"msg": "approved"}),
            # 106 → intentionally no log → NOT_SENT
        ]
        for log in logs:
            SOSYSPaymentLog.objects.create(**{k: Decimal(v) if k == "amount" else v for k, v in log.items()})

    def _seed_bank_statement(self):
        today = date.today()
        rows = [
            # 101 → SUCCESS and amount matches → MATCHED
            dict(claim_id=101, transaction_id="TXN-00001", amount="5000.00",
                 status="SUCCESS", settlement_date=today - timedelta(days=1)),
            # 102 → NO ROW → SETTLEMENT_PENDING
            # 103 → FAILED → STATUS_MISMATCH
            dict(claim_id=103, transaction_id="TXN-00003", amount="8750.00",
                 status="FAILED", settlement_date=today - timedelta(days=1)),
            # 104 → SUCCESS (gateway FAILED) → INVESTIGATION_REQUIRED
            dict(claim_id=104, transaction_id="TXN-00004", amount="3200.00",
                 status="SUCCESS", settlement_date=today - timedelta(days=1)),
            # 105 → SUCCESS but wrong amount → AMOUNT_MISMATCH
            dict(claim_id=105, transaction_id="TXN-00005", amount="17500.00",
                 status="SUCCESS", settlement_date=today - timedelta(days=1)),
            # 106 → bank has a record but no gateway → NOT_SENT (gateway wins on NOT_SENT rule)
        ]
        for row in rows:
            BankStatementRow.objects.create(
                **{k: Decimal(v) if k == "amount" else v for k, v in row.items()},
                import_batch="SEED"
            )
