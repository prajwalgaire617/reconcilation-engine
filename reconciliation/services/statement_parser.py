"""
Bank statement parser.
Supports CSV and PDF (via pdfplumber).

Two PDF formats are handled automatically:
  1. Tabular bank statement — rows with headers matching expected columns.
  2. Connect IPS payment slip — key-value receipt format (single transaction per page).
     Requires claim_id to be supplied via the upload form field since slips don't contain it.

Expected CSV / tabular-PDF columns:
    claim_id, transaction_id, amount, status, settlement_date
"""
import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import List, Optional


@dataclass
class StatementRow:
    claim_id: int
    transaction_id: str
    amount: Decimal
    status: str
    settlement_date: date


class StatementParser:
    DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"]

    def parse_csv(self, file_obj) -> List[StatementRow]:
        text = file_obj.read()
        if isinstance(text, bytes):
            text = text.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for i, row in enumerate(reader, start=2):
            try:
                rows.append(self._parse_row(row, i))
            except (ValueError, KeyError) as exc:
                raise ValueError(f"CSV row {i}: {exc}") from exc
        return rows

    EXPECTED_COLUMNS = {"claim_id", "transaction_id", "amount", "status", "settlement_date"}

    def parse_pdf(self, file_obj, claim_id: Optional[int] = None) -> List[StatementRow]:
        try:
            import pdfplumber
        except ImportError:
            raise ImportError("pdfplumber is required for PDF parsing: pip install pdfplumber")

        rows = []
        with pdfplumber.open(file_obj) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                # Image-only page (0 text chars, ≥1 image) → OCR
                if not page.chars and page.images:
                    text = self._ocr_page(page)
                else:
                    text = page.extract_text() or ""

                if self._is_connectips_slip(text):
                    if claim_id is None:
                        raise ValueError(
                            "Connect IPS slip detected but no Claim ID was provided. "
                            "Enter the Claim ID in the form before uploading."
                        )
                    rows.extend(self._parse_connectips_slip(text, claim_id, page_num))
                else:
                    rows.extend(self._extract_table_rows(page, page_num))
        return rows

    def _ocr_page(self, page) -> str:
        try:
            import pytesseract
        except ImportError:
            raise ImportError(
                "This PDF contains images with no text layer. "
                "Install pytesseract to enable OCR: pip install pytesseract"
            )
        pil_img = page.to_image(resolution=200).original
        # Get word-level bounding boxes so we can group by Y position.
        # image_to_string alone splits two-column layouts across separate lines,
        # leaving label and value on different lines.
        data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)
        return self._reconstruct_lines(data)

    def _reconstruct_lines(self, data: dict) -> str:
        words = []
        for i, text in enumerate(data["text"]):
            if not str(text).strip():
                continue
            top = int(data["top"][i])
            height = int(data["height"][i])
            words.append({"text": str(text), "top": top, "bottom": top + height, "left": int(data["left"][i])})

        if not words:
            return ""

        words.sort(key=lambda w: w["top"])
        lines, current, bottom = [], [words[0]], words[0]["bottom"]
        for w in words[1:]:
            if w["top"] <= bottom + 8:  # 8px Y-overlap tolerance handles same-row words
                current.append(w)
                bottom = max(bottom, w["bottom"])
            else:
                lines.append(current)
                current, bottom = [w], w["bottom"]
        lines.append(current)

        return "\n".join(
            " ".join(w["text"] for w in sorted(line, key=lambda w: w["left"]))
            for line in lines
        )

    def _is_connectips_slip(self, text: str) -> bool:
        lower = text.lower()
        return "transaction id" in lower and "debit status" in lower

    def preview_pdf(self, file_obj) -> dict:
        """Parse a PDF and return raw extracted fields without saving. claim_id not required."""
        try:
            import pdfplumber
        except ImportError:
            raise ImportError("pdfplumber is required: pip install pdfplumber")

        with pdfplumber.open(file_obj) as pdf:
            page = pdf.pages[0]
            if not page.chars and page.images:
                text = self._ocr_page(page)
            else:
                text = page.extract_text() or ""

        if self._is_connectips_slip(text):
            return self._extract_connectips_fields(text)

        return {"error": "Not a recognised Connect IPS slip. Use CSV upload for tabular statements."}

    def _extract_connectips_fields(self, text: str) -> dict:
        SEP = r"[:\>]"

        def find(pattern):
            m = re.search(pattern, text, re.IGNORECASE)
            return m.group(1).strip() if m else None

        txn_id   = find(rf"Transaction\s+Id\s*{SEP}\s*(\S+)") or ""
        amount_s = find(rf"Transaction\s+Amount\s*{SEP}\s*NPR\s*([\d,]+\.?\d*)") or "0"
        status_r = (
            find(rf"Debit\s+Status\s*{SEP}\s*(\w+)")
            or find(rf"Credit\s+Status\s*{SEP}\s*(\w+)")
            or "UNKNOWN"
        )
        status   = re.sub(r"[^\w]", "", status_r).upper()
        date_raw = find(rf"Transaction\s+Date\s*{SEP}\s*(\d{{4}}-\d{{2}}-\d{{2}})") \
                   or find(r"(\d{4}-\d{2}-\d{2})")

        # Each of these rows has two columns on the same OCR line — stop before the right-column label
        sender  = find(rf"User\s+Name\s*{SEP}\s*(.+?)\s+Username\s*{SEP}") or \
                  find(rf"Account\s+Name\s*{SEP}\s*(.+?)\s+Account\s+Number\s*{SEP}") or ""
        bank    = find(rf"Bank\s+Name\s*{SEP}\s*(.+?)\s+Name\s*{SEP}") or \
                  find(rf"Bank\s+Name\s*{SEP}\s*([^\n]+)") or ""
        branch  = find(rf"Bank\s+Branch\s*{SEP}\s*([^\n]+)") or ""
        acct_no = find(rf"Account\s+Number\s*{SEP}\s*(\S+)") or ""
        charge  = find(rf"Charge\s+Amount\s*{SEP}\s*NPR\s*([\d,]+\.?\d*)") or "0.00"
        bene    = find(rf"Bank\s+Name\s*.+?Name\s*{SEP}\s*(.+)") or \
                  find(rf"Username\s*{SEP}\s*\S+\s+Name\s*{SEP}\s*(.+)") or ""

        return {
            "format":           "connect_ips",
            "transaction_id":   txn_id,
            "amount":           amount_s,
            "charge_amount":    charge,
            "status":           status,
            "settlement_date":  date_raw[:10] if date_raw else None,
            "sender_name":      sender.strip(),
            "bank_name":        bank.strip(),
            "bank_branch":      branch.strip(),
            "account_number":   acct_no,
            "beneficiary_name": bene.strip(),
        }

    def _parse_connectips_slip(self, text: str, claim_id: int, page_num: int) -> List[StatementRow]:
        # [:\>] handles OCR misreading ':' as '>' in two-column layouts
        SEP = r"[:\>]"

        def find(pattern):
            m = re.search(pattern, text, re.IGNORECASE)
            return m.group(1).strip() if m else None

        txn_id = find(rf"Transaction\s+Id\s*{SEP}\s*(\S+)") or ""
        amount_raw = find(rf"Transaction\s+Amount\s*{SEP}\s*NPR\s*([\d,]+\.?\d*)")
        amount = self._parse_amount(amount_raw) if amount_raw else Decimal("0")

        # Prefer Debit Status; fall back to Credit Status. Strip trailing punctuation from OCR.
        status_raw = (
            find(rf"Debit\s+Status\s*{SEP}\s*(\w+)")
            or find(rf"Credit\s+Status\s*{SEP}\s*(\w+)")
            or "FAILED"
        )
        status = re.sub(r"[^\w]", "", status_raw).upper()
        if status not in ("SUCCESS", "FAILED"):
            status = "FAILED"

        # Date may appear on same line as label, or on next line (OCR of two-column layout).
        # Search for any YYYY-MM-DD pattern in the full text as fallback.
        date_raw = find(rf"Transaction\s+Date\s*{SEP}\s*(\d{{4}}-\d{{2}}-\d{{2}})")
        if not date_raw:
            date_raw = find(r"(\d{4}-\d{2}-\d{2})")
        if date_raw:
            settlement_date = datetime.strptime(date_raw[:10], "%Y-%m-%d").date()
        else:
            settlement_date = date.today()

        return [StatementRow(claim_id, txn_id, amount, status, settlement_date)]

    def _extract_table_rows(self, page, page_num: int) -> List[StatementRow]:
        # Try bordered-table detection first
        table = page.extract_table()
        if table and len(table) > 1:
            header = [str(h).lower().strip() for h in table[0]]
            if self.EXPECTED_COLUMNS.issubset(set(header)):
                return self._parse_table(table[1:], header, page_num)

        # Fall back to word-cluster table (implicit columns, no borders)
        words_table = page.extract_table(
            table_settings={"vertical_strategy": "text", "horizontal_strategy": "text"}
        )
        if words_table and len(words_table) > 1:
            header = [str(h).lower().strip() for h in words_table[0]]
            if self.EXPECTED_COLUMNS.issubset(set(header)):
                return self._parse_table(words_table[1:], header, page_num)

        # Last resort: raw text, split into whitespace-delimited lines
        return self._parse_text_lines(page.extract_text() or "", page_num)

    def _parse_table(self, data_rows, header, page_num: int) -> List[StatementRow]:
        rows = []
        for i, raw_row in enumerate(data_rows, start=2):
            row_dict = dict(zip(header, [str(v) if v is not None else "" for v in raw_row]))
            try:
                rows.append(self._parse_row(row_dict, f"page {page_num} row {i}"))
            except (ValueError, KeyError) as exc:
                raise ValueError(f"PDF page {page_num} row {i}: {exc}") from exc
        return rows

    def _parse_text_lines(self, text: str, page_num: int) -> List[StatementRow]:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        header_idx = None
        header = []
        for idx, line in enumerate(lines):
            cols = line.lower().split()
            if self.EXPECTED_COLUMNS.issubset(set(cols)):
                header = cols
                header_idx = idx
                break
        if header_idx is None:
            return []
        rows = []
        for i, line in enumerate(lines[header_idx + 1:], start=2):
            parts = line.split()
            if len(parts) < len(header):
                continue
            row_dict = dict(zip(header, parts))
            try:
                rows.append(self._parse_row(row_dict, f"page {page_num} row {i}"))
            except (ValueError, KeyError):
                continue
        return rows

    def _parse_row(self, row: dict, location) -> StatementRow:
        claim_id = int(row["claim_id"])
        transaction_id = str(row["transaction_id"]).strip()
        amount = self._parse_amount(row["amount"])
        status = str(row["status"]).strip().upper()
        settlement_date = self._parse_date(str(row["settlement_date"]).strip())
        return StatementRow(claim_id, transaction_id, amount, status, settlement_date)

    def _parse_amount(self, value) -> Decimal:
        cleaned = re.sub(r"[^\d.]", "", str(value))
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            raise ValueError(f"Cannot parse amount: {value!r}")

    def _parse_date(self, value: str) -> date:
        for fmt in self.DATE_FORMATS:
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
        raise ValueError(f"Cannot parse date: {value!r}. Expected formats: {self.DATE_FORMATS}")
