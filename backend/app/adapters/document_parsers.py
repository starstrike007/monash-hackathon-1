from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path

from app.adapters.dataset_loader import DatasetLoader
from app.api.schemas.common import DocumentType


@dataclass
class ParsedDocument:
    path: str
    text: str = ""
    table_rows: list[list[str]] = field(default_factory=list)
    locations: list[dict] = field(default_factory=list)
    readable: bool = True
    error: str | None = None
    document_type: DocumentType = DocumentType.UNKNOWN
    # `lines` and `line_meta` are aligned 1:1: line_meta[i] describes where
    # lines[i] came from (page/line/sheet/cell/table_index/row_index/bbox),
    # so Stage 2 extraction can attach a precise location to every field it finds.
    lines: list[str] = field(default_factory=list)
    line_meta: list[dict] = field(default_factory=list)
    page_count: int | None = None


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


def _parse_txt(raw: bytes) -> tuple[str, list[str], list[dict]]:
    text = raw.decode("utf-8", errors="replace")
    raw_lines = text.replace("\r", "").split("\n")
    lines = [line.strip() for line in raw_lines]
    line_meta = [{"line": index + 1} for index in range(len(lines))]
    return text, lines, line_meta


def _pdf_page_lines(page) -> list[dict]:
    """Best-effort per-line text + normalized bbox for one pdfplumber page.

    Falls back to plain text lines (page number only, no bbox) if the
    installed pdfplumber version lacks `extract_text_lines` or the page has
    no usable geometry - we never invent a bounding box.
    """

    width = page.width or 0
    height = page.height or 0
    if width and height:
        try:
            text_lines = page.extract_text_lines(layout=False) or []
            results = []
            for text_line in text_lines:
                value = (text_line.get("text") or "").strip()
                if not value:
                    continue
                results.append(
                    {
                        "text": value,
                        "bbox": {
                            "x0": round(text_line.get("x0", 0.0) / width, 4),
                            "x1": round(text_line.get("x1", 0.0) / width, 4),
                            "top": round(text_line.get("top", 0.0) / height, 4),
                            "bottom": round(text_line.get("bottom", 0.0) / height, 4),
                        },
                    }
                )
            if results:
                return results
        except Exception:
            pass
    page_text = page.extract_text() or ""
    return [{"text": line.strip()} for line in page_text.split("\n") if line.strip()]


def _parse_pdf(raw: bytes) -> tuple[str, list[dict], list[str], list[dict], int]:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("pdfplumber is not installed") from exc

    pages: list[str] = []
    locations: list[dict] = []
    lines: list[str] = []
    line_meta: list[dict] = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        page_count = len(pdf.pages)
        for index, page in enumerate(pdf.pages, start=1):
            page_text = page.extract_text() or ""
            pages.append(page_text)
            locations.append({"page": index, "text_length": len(page_text)})
            for entry in _pdf_page_lines(page):
                lines.append(entry["text"])
                meta: dict = {"page": index}
                if "bbox" in entry:
                    meta["bbox"] = entry["bbox"]
                line_meta.append(meta)
    text = "\n\n".join(pages)
    return text, locations, lines, line_meta, page_count


def _expand_multiline(row_text: str, meta: dict) -> tuple[list[str], list[dict]]:
    """Split a joined row/cell string on embedded newlines (multi-line cells),
    keeping the same location for every sub-line since they share one row/cell."""

    sub_lines = [part for part in row_text.split("\n")]
    return sub_lines, [dict(meta) for _ in sub_lines]


def _parse_docx(raw: bytes) -> tuple[str, list[list[str]], list[dict], list[str], list[dict]]:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("python-docx is not installed") from exc

    document = Document(io.BytesIO(raw))
    paragraphs = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    rows: list[list[str]] = []
    lines: list[str] = []
    line_meta: list[dict] = []
    for index, paragraph in enumerate(document.paragraphs):
        if paragraph.text.strip():
            lines.append(paragraph.text.strip())
            line_meta.append({"paragraph_index": index})
    for table_index, table in enumerate(document.tables):
        for row_index, row in enumerate(table.rows):
            cells = [cell.text.strip() for cell in row.cells]
            rows.append(cells)
            row_lines, row_metas = _expand_multiline(
                " | ".join(cells), {"table_index": table_index, "row_index": row_index}
            )
            lines.extend(row_lines)
            line_meta.extend(row_metas)
    text = "\n".join(paragraphs + [" | ".join(row) for row in rows])
    locations = [{"table": i} for i in range(len(document.tables))]
    return text, rows, locations, lines, line_meta


def _parse_xlsx(raw: bytes) -> tuple[str, list[list[str]], list[dict], list[str], list[dict]]:
    try:
        import openpyxl
    except ImportError as exc:
        raise RuntimeError("openpyxl is not installed") from exc

    workbook = openpyxl.load_workbook(io.BytesIO(raw), data_only=True, read_only=True)
    rows: list[list[str]] = []
    locations: list[dict] = []
    lines: list[str] = []
    line_meta: list[dict] = []
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows():
            values = ["" if cell.value is None else str(cell.value) for cell in row]
            if any(value.strip() for value in values):
                rows.append(values)
                row_number = row[0].row
                locations.append({"sheet": sheet.title, "row": row_number})
                cells = [
                    {
                        "cell": cell.coordinate,
                        "value": ("" if cell.value is None else str(cell.value)).strip(),
                    }
                    for cell in row
                ]
                row_lines, row_metas = _expand_multiline(
                    " | ".join(values), {"sheet": sheet.title, "row": row_number, "cells": cells}
                )
                lines.extend(row_lines)
                line_meta.extend(row_metas)
    text = "\n".join(" | ".join(row) for row in rows)
    return text, rows, locations, lines, line_meta


def parse_attachment(loader: DatasetLoader, relative_path: str) -> ParsedDocument:
    extension = Path(relative_path).suffix.lower()
    try:
        raw = loader.read_attachment_bytes(relative_path)
        if extension == ".txt":
            text, lines, line_meta = _parse_txt(raw)
            parsed = ParsedDocument(
                path=relative_path,
                text=text,
                readable=bool(text.strip()),
                lines=lines,
                line_meta=line_meta,
            )
        elif extension == ".pdf":
            text, locations, lines, line_meta, page_count = _parse_pdf(raw)
            parsed = ParsedDocument(
                path=relative_path,
                text=text,
                locations=locations,
                readable=bool(text.strip()),
                lines=lines,
                line_meta=line_meta,
                page_count=page_count,
            )
        elif extension == ".docx":
            text, rows, locations, lines, line_meta = _parse_docx(raw)
            parsed = ParsedDocument(
                path=relative_path,
                text=text,
                table_rows=rows,
                locations=locations,
                lines=lines,
                line_meta=line_meta,
            )
        elif extension == ".xlsx":
            text, rows, locations, lines, line_meta = _parse_xlsx(raw)
            parsed = ParsedDocument(
                path=relative_path,
                text=text,
                table_rows=rows,
                locations=locations,
                lines=lines,
                line_meta=line_meta,
            )
        else:
            parsed = ParsedDocument(path=relative_path, readable=False, error=f"Unsupported extension: {extension}")
    except Exception as exc:  # parser failures are expected operational errors
        parsed = ParsedDocument(path=relative_path, readable=False, error=str(exc))

    if not parsed.readable:
        parsed.document_type = DocumentType.UNREADABLE
    else:
        parsed.document_type = detect_document_type(parsed.text)
    return parsed


def render_pdf_page_png(raw: bytes, page_number: int, scale: float = 2.0) -> bytes:
    """Render one PDF page (1-indexed) to PNG bytes using pypdfium2.

    Used by the document viewer for both text and scanned PDFs so the UI can
    show the real page image and, for scanned pages, a location-free
    "quoted text" callout instead of a fabricated bounding box.
    """

    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(raw)
    try:
        if page_number < 1 or page_number > len(pdf):
            raise ValueError(f"Page {page_number} out of range (document has {len(pdf)} pages)")
        page = pdf[page_number - 1]
        bitmap = page.render(scale=scale)
        pil_image = bitmap.to_pil()
        buffer = io.BytesIO()
        pil_image.save(buffer, format="PNG")
        return buffer.getvalue()
    finally:
        pdf.close()
