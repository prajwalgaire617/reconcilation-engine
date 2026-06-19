"""
Management command: python manage.py fetch_fhir_claims [--months N]

Fetches claims from the FHIR R4 server and upserts them into the local
fhir_claims table. Designed to run nightly (off-peak) via cron:

    0 2 * * * /path/to/venv/bin/python manage.py fetch_fhir_claims --months 3

Do NOT run this during peak hours — FHIR fetch blocks on external I/O.
"""
from django.core.management.base import BaseCommand
from reconciliation.services.claim_service import ClaimService
from reconciliation.dtos.claim import FetchClaimsCommand


class Command(BaseCommand):
    help = "Fetch claims from FHIR R4 and cache locally (run nightly, not during peak hours)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--months", type=int, default=3,
            help="How many months back to fetch (default: 3)"
        )

    def handle(self, *args, **options):
        months = options["months"]
        self.stdout.write(f"Fetching FHIR claims (last {months} months)…")

        try:
            result = ClaimService().sync_fhir(FetchClaimsCommand(months=months))
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"FHIR sync failed: {exc}"))
            return

        self.stdout.write(self.style.SUCCESS(
            f"  Created: {result.created}  "
            f"Updated: {result.updated}  "
            f"Skipped (zero amount): {result.skipped}  "
            f"Total fetched: {result.fetched}"
        ))
