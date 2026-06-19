import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="PaymentBatch",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("batch_number", models.CharField(max_length=50, unique=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("SUBMITTED", "Submitted"),
                            ("PARTIAL", "Partial"),
                            ("COMPLETED", "Completed"),
                            ("FAILED", "Failed"),
                        ],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("retry_count", models.IntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "parent_batch",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="retry_batches",
                        to="reconciliation.paymentbatch",
                    ),
                ),
            ],
            options={"db_table": "payment_batches", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="PaymentItem",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("claim_id", models.IntegerField(db_index=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("PENDING", "Pending"),
                            ("SUCCESS", "Success"),
                            ("FAILED", "Failed"),
                            ("RETRY", "Retry"),
                        ],
                        default="PENDING",
                        max_length=20,
                    ),
                ),
                ("gateway_reference", models.CharField(blank=True, default="", max_length=100)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "batch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="items",
                        to="reconciliation.paymentbatch",
                    ),
                ),
            ],
            options={"db_table": "payment_items"},
        ),
        migrations.CreateModel(
            name="SOSYSPaymentLog",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("claim_id", models.IntegerField(db_index=True)),
                ("gateway_reference", models.CharField(db_index=True, max_length=100)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("status", models.CharField(max_length=20)),
                ("response_payload", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "sosys_payment_logs", "ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="BankStatementRow",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("claim_id", models.IntegerField(db_index=True)),
                ("transaction_id", models.CharField(db_index=True, max_length=100)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("status", models.CharField(max_length=20)),
                ("settlement_date", models.DateField()),
                ("import_batch", models.CharField(blank=True, default="", max_length=50)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "bank_statement_rows", "ordering": ["-settlement_date"]},
        ),
        migrations.CreateModel(
            name="ReconciliationRecord",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("claim_id", models.IntegerField(db_index=True)),
                (
                    "payment_item",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="reconciliations",
                        to="reconciliation.paymentitem",
                    ),
                ),
                ("gateway_status", models.CharField(blank=True, default="", max_length=20)),
                ("bank_status", models.CharField(blank=True, default="", max_length=20)),
                ("gateway_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ("bank_amount", models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                (
                    "result",
                    models.CharField(
                        choices=[
                            ("MATCHED", "Matched"),
                            ("SETTLEMENT_PENDING", "Settlement Pending"),
                            ("STATUS_MISMATCH", "Status Mismatch"),
                            ("INVESTIGATION_REQUIRED", "Investigation Required"),
                            ("AMOUNT_MISMATCH", "Amount Mismatch"),
                            ("NOT_SENT", "Not Sent"),
                        ],
                        max_length=30,
                    ),
                ),
                ("reason", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "reconciliation_results", "ordering": ["-created_at"]},
        ),
    ]
