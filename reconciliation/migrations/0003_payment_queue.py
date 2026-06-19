import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reconciliation", "0002_fhirclaim"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentQueue",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "batch",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="queue_entry",
                        to="reconciliation.paymentbatch",
                    ),
                ),
                ("position", models.IntegerField(db_index=True)),
                ("scheduled_at", models.DateTimeField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("QUEUED",    "Queued"),
                            ("EXECUTING", "Executing"),
                            ("COMPLETED", "Completed"),
                            ("FAILED",    "Failed"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        default="QUEUED",
                        max_length=20,
                    ),
                ),
                ("executed_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "payment_queue", "ordering": ["position", "scheduled_at"]},
        ),
    ]
