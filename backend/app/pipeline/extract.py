from __future__ import annotations

import re

from app.adapters.document_parsers import ParsedDocument
from app.api.schemas.common import (
    CanonicalField,
    Confidence,
    DocumentExtraction,
    DocumentRole,
    DocumentType,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    FieldExtraction,
)
from app.pipeline.normalize import normalize_extraction, normalize_field, normalize_text


FIELD_PATTERNS: dict[CanonicalField, tuple[str, ...]] = {
    CanonicalField.SHIPPER: (
        r"shipper(?:\s*/\s*exporter)?",
        r"shipper name",
        "\u53d1\u8d27\u4eba",
    ),
    CanonicalField.CONSIGNEE: (
        r"consignee(?:\s*\([^)]*\))?",
        r"to\s+the\s+order\s+of",
        "\u6536\u8d27\u4eba",
    ),
    CanonicalField.NOTIFY_PARTY: (
        r"notify(?:\s+party)?(?:\s*/\s*intermediate\s+consignee)?",
        "\u901a\u77e5\u65b9",
    ),
    CanonicalField.PORT_OF_LOADING: (
        r"port\s+of\s+loading(?:\s*\(\s*pol\s*\))?",
        r"load\s+port",
        r"\bpol\b",
        "\u88c5\u8d27\u6e2f",
    ),
    CanonicalField.PORT_OF_DISCHARGE: (
        r"port\s+of\s+discharge",
        r"discharge\s+port",
        r"\bpod\b",
        r"destination\s+port",
        "\u5378\u8d27\u6e2f",
    ),
    CanonicalField.CONTAINER_COUNT: (
        r"container\s+count",
        r"total\s+containers?",
        r"no\.?\s+of\s+containers?(?:\s+or\s+packages)?",
        r"containers?(?=\s*[:=|\-])",
        "\u96c6\u88c5\u7bb1",
    ),
    CanonicalField.GROSS_WEIGHT_KG: (
        r"(?:total\s+)?gross\s+(?:weight|wt)[^|:=\-\d]*",
        "\u6bdb\u91cd",
    ),
}

PLACEHOLDERS = {"", "TBA", "TBC", "N/A", "NA", "-", "_", "UNKNOWN", "TO BE ADVISED"}


_LOCATION_KEYS = {
    "page",
    "line",
    "sheet",
    "cell",
    "table_index",
    "row_index",
    "paragraph_index",
    "bbox",
}


def _effective_lines(parsed: ParsedDocument) -> tuple[list[str], list[dict]]:
    """Location-tagged lines to search, falling back to a plain line split
    (line numbers only) for ParsedDocuments built without parser-time
    location metadata, e.g. fixtures/tests that construct ParsedDocument
    directly from a text blob."""

    if parsed.lines:
        return parsed.lines, parsed.line_meta
    raw_lines = parsed.text.replace("\r", "").split("\n")
    return raw_lines, [{"line": index + 1} for index in range(len(raw_lines))]


def _resolve_cell(location: dict, value: str | None) -> dict:
    """Narrow a row-level xlsx location down to the specific cell that holds
    `value`, when the row's per-cell values were captured at parse time."""

    location = dict(location)
    cells = location.pop("cells", None)
    if cells and value:
        target = value.strip().upper()
        for cell in cells:
            if cell.get("value", "").strip().upper() == target:
                location["cell"] = cell.get("cell")
                return location
        for cell in cells:
            cell_value = cell.get("value", "").strip().upper()
            if target and cell_value and target in cell_value:
                location["cell"] = cell.get("cell")
                return location
    return location


def _find_value(
    lines: list[str], line_meta: list[dict], patterns: tuple[str, ...]
) -> tuple[str | None, str | None, dict]:
    for index, line in enumerate(lines):
        stripped = line.strip().strip("|").strip()
        for pattern in patterns:
            match = re.search(
                rf"(?:^|\|)\s*{pattern}\s*(?:\([^)]*\)\s*)*(?:[:\uFF1A=\-]\s*)?(.*)$",
                stripped,
                flags=re.IGNORECASE,
            )
            if not match:
                continue
            value = match.group(1).strip(" .|;\t")
            if "|" in value:
                value = next((part.strip(" .;\t") for part in value.split("|") if part.strip()), "")
            location = dict(line_meta[index]) if index < len(line_meta) else {}
            if not value and index + 1 < len(lines):
                value = lines[index + 1].strip(" .|;\t")
                if index + 1 < len(line_meta):
                    location = dict(line_meta[index + 1])
            if value and pattern.lower().startswith(r"to\s+the\s+order\s+of"):
                value = f"To the Order of {value}"
            location = _resolve_cell(location, value)
            return (value or None), stripped, location
    return None, None, {}


def locate_value(parsed: ParsedDocument, value: str) -> dict:
    """Best-effort location lookup for a value accepted from an LLM/vision
    proposal: search the parsed lines for it so the review UI can still
    point at where it came from. Returns {} if no line matches."""

    lines, line_meta = _effective_lines(parsed)
    target = re.sub(r"[^a-z0-9]+", "", value.lower())
    if not target:
        return {}
    for index, line in enumerate(lines):
        candidate = re.sub(r"[^a-z0-9]+", "", line.lower())
        if target and target in candidate:
            location = dict(line_meta[index]) if index < len(line_meta) else {}
            return _resolve_cell(location, value)
    return {}


def _evidence(snippet: str | None, raw_value: str | None, location: dict, path: str) -> FieldEvidence:
    quoted = snippet or raw_value or ""
    fields = {key: value for key, value in location.items() if key in _LOCATION_KEYS and value is not None}
    return FieldEvidence(snippet=quoted, quoted_text=quoted or None, source_path=path, **fields)


def _starts_field_label(line: str) -> bool:
    stripped = line.strip().strip("|").strip()
    for patterns in FIELD_PATTERNS.values():
        for pattern in patterns:
            try:
                if re.match(rf"(?:{pattern})(?:\s|[:=()/|-]|$)", stripped, flags=re.IGNORECASE):
                    return True
            except re.error:
                continue
    return False


def _line_index(lines: list[str], snippet: str | None) -> int | None:
    if not snippet:
        return None
    target = snippet.strip().strip("|").strip()
    for index, line in enumerate(lines):
        if line.strip().strip("|").strip() == target:
            return index
    return None


def _following_context(lines: list[str], start: int | None, limit: int = 6) -> list[str]:
    if start is None:
        return []
    context: list[str] = []
    for line in lines[start + 1 : start + 1 + limit]:
        stripped = line.strip().strip("|").strip()
        if not stripped:
            continue
        if _starts_field_label(stripped):
            break
        context.append(normalize_text(stripped))
    return context


def _same_address_context(left: list[str], right: list[str]) -> bool:
    if not left or not right:
        return False
    overlap = set(left) & set(right)
    if len(left) == len(right) == 1:
        return bool(overlap)
    return len(overlap) >= 2 and len(overlap) / max(len(left), len(right)) >= 0.75


def _repair_compound_notify(fields: list[FieldExtraction], parsed: ParsedDocument, lines: list[str]) -> None:
    """Repair PDF text-layer joins in `Notify Party/Intermediate Consignee`.

    Some PDFs place the label and value in overlapping text objects. pdfplumber
    then returns strings such as `/Intermediate ConsKiTgPne CeO., LTD` rather
    than the visible party name. If the following address block is identical to
    the document's consignee block, it is safe to reuse that party value. If it
    is not, mark the field ambiguous instead of accepting OCR/layout garbage as
    a real mismatch.
    """

    notify = next((field for field in fields if field.field_name == CanonicalField.NOTIFY_PARTY), None)
    consignee = next((field for field in fields if field.field_name == CanonicalField.CONSIGNEE), None)
    if not notify or not consignee or notify.state != ExtractionState.FOUND or not notify.raw_value:
        return
    if not re.match(r"^\s*/?\s*intermediate\s+cons", notify.raw_value, flags=re.IGNORECASE):
        return

    notify_context = _following_context(lines, _line_index(lines, notify.evidence.snippet))
    consignee_context = _following_context(lines, _line_index(lines, consignee.evidence.snippet))
    if _same_address_context(notify_context, consignee_context) and consignee.raw_value:
        notify.raw_value = consignee.raw_value
        notify.normalized_value = normalize_field(CanonicalField.NOTIFY_PARTY, notify.raw_value)
        return

    notify.state = ExtractionState.AMBIGUOUS
    notify.normalized_value = None


def extract_document(parsed: ParsedDocument, role: DocumentRole | None = None) -> DocumentExtraction:
    fields: list[FieldExtraction] = []
    lines, line_meta = _effective_lines(parsed)
    for field_name, patterns in FIELD_PATTERNS.items():
        if not parsed.readable:
            fields.append(
                FieldExtraction(
                    field_name=field_name,
                    state=ExtractionState.UNREADABLE,
                    evidence=FieldEvidence(source_path=parsed.path),
                )
            )
            continue

        raw_value, snippet, location = _find_value(lines, line_meta, patterns)
        if raw_value is None:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.MISSING,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=_evidence(snippet, None, location, parsed.path),
            )
        elif raw_value.strip().upper() in PLACEHOLDERS:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.PLACEHOLDER,
                raw_value=raw_value,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=_evidence(snippet, raw_value, location, parsed.path),
            )
        else:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.FOUND,
                raw_value=raw_value,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=_evidence(snippet, raw_value, location, parsed.path),
            )
        fields.append(normalize_extraction(extraction))

    _repair_compound_notify(fields, parsed, lines)

    return DocumentExtraction(
        role=role,
        path=parsed.path,
        document_type=parsed.document_type,
        readable=parsed.readable,
        text_preview=parsed.text[:500],
        table_rows=parsed.table_rows,
        locations=parsed.locations,
        fields=fields,
    )
