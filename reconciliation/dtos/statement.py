"""
Bank Statement DTOs — contracts for statement import.
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class ImportStatementCommand:
    """Input DTO: import a bank statement file."""
    file_type: str           # csv | pdf
    claim_id: int | None     # required for Connect IPS PDF receipts


@dataclass(frozen=True)
class StatementImportResultDTO:
    """Output DTO: result of a bank statement import."""
    rows_imported: int
    import_batch: str
