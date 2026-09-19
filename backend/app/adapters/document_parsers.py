from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path

from backend.app.adapters.dataset_loader import DatasetLoader
from backend.app.api.schemas.common import DocumentType


@dataclass
class ParsedDocument:
    path: str
    text: str = ""
    table_rows: list[list[str]] = field(default_factory=list)
    locations: list[dict] = field(default_factory=list)
    readable: bool = True
    error: str | None = None
    document_type: DocumentType = DocumentType.UNKNOWN


def detect_document_type(text: str) -> DocumentType:
    upper = text.upper()
    if re.search(
        r"BILL\s+OF\s+LADING\s+INSTRUCTION|\bBL\s+INSTRUCTION\b|\bSI\s+INSTRUCTION\b|SHIPPING\s+INSTRUCTION",
        upper,
    ):
        return DocumentType.SHIPPING_INSTRUCTION
    if re.search(r"BILL\s+OF\s+LADING|\bB/L\b|DRAFT\s+BL", upper):
        return DocumentType.BILL_OF_LADING
    if re.search(r"SHIPPER/EXPORTER|NOTIFY\s+PARTY", upper):
        return DocumentType.SHIPPING_INSTRUCTION
    if "COMMERCIAL INVOICE" in upper or re.search(r"\bINVOICE\b", upper):
        return DocumentType.COMMERCIAL_INVOICE
    if "PACKING LIST" in upper:
        return DocumentType.PACKING_LIST
    if "CERTIFICATE OF ORIGIN" in upper:
        return DocumentType.CERTIFICATE_OF_ORIGIN
    return DocumentType.UNKNOWN


def _parse_pdf(raw: bytes) -> tuple[str, list[dict]]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("pdfplumber is not installed") from exc

    pages: list[str] = []
    locations: list[dict] = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            pages.append(page_text)
            locations.append({"page": index, "text_length": len(page_text)})
    text = "\n\n".join(pages)
    return text, locations


def _parse_docx(raw: bytes) -> tuple[str, list[list[str]], list[dict]]:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("python-docx is not installed") from exc

    document = Document(io.BytesIO(raw))
    paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    rows: list[list[str]] = []
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            rows.append(cells)
    text = "\n".join(paragraphs + [" | ".join(row) for row in rows])
    return text, rows, [{"table": i} for i in range(len(document.tables))]


def _parse_xlsx(raw: bytes) -> tuple[str, list[list[str]], list[dict]]:
    try:
        import openpyxl
    except ImportError as exc:
        raise RuntimeError("openpyxl is not installed") from exc

    workbook = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
    rows: list[list[str]] = []
    locations: list[dict] = []
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            values = ["" if cell.value is None else str(cell.value) for cell in row]
            if any(value.strip() for value in values):
                rows.append(values)
                locations.append({"sheet": sheet.title, "row": row[0].row})
    text = "\n".join(" | ".join(row) for row in rows)
    return text, rows, locations


def parse_attachment(loader: DatasetLoader, relative_path: str) -> ParsedDocument:
    extension = Path(relative_path).suffix.lower()
    try:
        raw = loader.read_attachment_bytes(relative_path)
        if extension == ".txt":
            text = raw.decode("utf-8", errors="replace")
            parsed = ParsedDocument(path=relative_path, text=text, readable=bool(text.strip()))
        elif extension == ".pdf":
            text, locations = _parse_pdf(raw)
            parsed = ParsedDocument(path=relative_path, text=text, locations=locations, readable=bool(text.strip()))
        elif extension == ".docx":
            text, rows, locations = _parse_docx(raw)
            parsed = ParsedDocument(path=relative_path, text=text, table_rows=rows, locations=locations)
        elif extension == ".xlsx":
            text, rows, locations = _parse_xlsx(raw)
            parsed = ParsedDocument(path=relative_path, text=text, table_rows=rows, locations=locations)
        else:
            parsed = ParsedDocument(path=relative_path, readable=False, error=f"Unsupported extension: {extension}")
    except Exception as exc:  # parser failures are expected operational errors
        parsed = ParsedDocument(path=relative_path, readable=False, error=str(exc))

    if not parsed.readable:
        parsed.document_type = DocumentType.UNREADABLE
    else:
        parsed.document_type = detect_document_type(parsed.text)
    return parsed
