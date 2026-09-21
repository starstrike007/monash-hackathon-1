from __future__ import annotations

import re

from app.adapters.document_parsers import ParsedDocument
from app.api.schemas.common import (
    CanonicalField,
    Confidence,
    DocumentExtraction,
    DocumentRole,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    FieldExtraction,
)
from app.pipeline.field_aliases import FIELD_LABEL_ALIASES
from app.pipeline.normalize import normalize_extraction


FIELD_PATTERNS = FIELD_LABEL_ALIASES

PLACEHOLDERS = {"", "TBA", "TBC", "N/A", "NA", "-", "_", "UNKNOWN", "TO BE ADVISED"}


def _match_label(
    label: str,
    patterns: tuple[str, ...],
    *,
    require_start: bool = False,
) -> re.Match[str] | None:
    for pattern in patterns:
        match = re.search(pattern, label, flags=re.IGNORECASE)
        if match and (not require_start or match.start() == 0):
            return match
    return None


def _tail_after_label(label: str, match: re.Match[str]) -> str:
    tail = label[match.end() :].strip()
    # Tables often put a descriptive label in one or more parentheses after
    # the English alias, for example ``Shipper (Principal or Seller)``.
    tail = re.sub(r"^(?:\([^)]*\)\s*)+", "", tail)
    return tail.lstrip(":：=–- ").strip()


def _location_for_line(parsed: ParsedDocument, line_number: int, part_number: int) -> dict:
    if line_number >= len(parsed.locations):
        return {}
    location = dict(parsed.locations[line_number])
    cells = location.get("cells")
    if isinstance(cells, list) and 0 <= part_number < len(cells):
        cell = cells[part_number]
        if isinstance(cell, dict) and cell.get("cell") is not None:
            location["cell"] = str(cell["cell"])
    location.pop("cells", None)
    return location


def _clean_value(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip(" .|;\t\r\n")


def _find_value(
    parsed: ParsedDocument,
    patterns: tuple[str, ...],
) -> tuple[str | None, str | None, dict | None]:
    lines = parsed.text.replace("\r", "").split("\n")
    for index, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            continue
        parts = [part.strip() for part in stripped.split("|")]
        candidates: list[tuple[str, str | None, int]] = []

        # Explicit separators are preferred so a colon in a value cannot be
        # mistaken for a second label.
        # Explicit separators are preferred, but search only the label cell
        # when a table row contains pipes. A colon in a value such as
        # ``P.O. BOX: 123`` must not turn the address tail into the field
        # value.
        separator_segment = parts[0] if len(parts) > 1 else stripped
        separator = re.search(r"[:：=]", separator_segment)
        if separator:
            candidates.append(
                (
                    separator_segment[: separator.start()].strip(),
                    separator_segment[separator.end() :].strip(),
                    0,
                )
            )

        # Spreadsheet and Word table rows use pipe-separated cells after the
        # parser turns them into the shared text representation.
        if len(parts) > 1:
            candidates.extend(
                (part, parts[part_number + 1] if part_number + 1 < len(parts) else None, part_number)
                for part_number, part in enumerate(parts)
            )
        candidates.append((stripped, None, 0))

        for label, explicit_value, part_number in candidates:
            # A field label must begin its cell/line.  Searching anywhere in
            # a free-form line makes a table header such as
            # ``CONTAINER NO. DESCRIPTION GROSS WEIGHT (KG)`` look like a
            # gross-weight field and consumes the next row as its value.
            match = _match_label(label, patterns, require_start=True)
            if not match:
                continue
            value = _clean_value(explicit_value)
            if not value and part_number + 1 < len(parts):
                value = _clean_value(parts[part_number + 1])
            if not value:
                value = _clean_value(_tail_after_label(label, match))
            if not value and index + 1 < len(lines):
                value = _clean_value(lines[index + 1])
            location = _location_for_line(parsed, index, part_number)
            if value:
                return value, stripped, location
            return None, stripped, location
    return None, None, None


def _field_evidence(
    parsed: ParsedDocument,
    snippet: str,
    location: dict | None,
) -> FieldEvidence:
    location = location or {}
    return FieldEvidence(
        snippet=snippet,
        page=location.get("page"),
        sheet=location.get("sheet"),
        cell=location.get("cell"),
        source_path=parsed.path,
    )


def extract_document(parsed: ParsedDocument, role: DocumentRole | None = None) -> DocumentExtraction:
    fields: list[FieldExtraction] = []
    for field_name, patterns in FIELD_PATTERNS.items():
        if not parsed.readable:
            fields.append(
                FieldExtraction(
                    field_name=field_name,
                    state=ExtractionState.UNREADABLE,
                    evidence=FieldEvidence(snippet=parsed.error or "", source_path=parsed.path),
                )
            )
            continue

        raw_value, snippet, location = _find_value(parsed, patterns)
        if (
            field_name == CanonicalField.CONSIGNEE
            and raw_value
            and snippet
            and re.search(r"to\s+the\s+order\s+of", snippet, flags=re.IGNORECASE)
            and not raw_value.upper().startswith("TO THE ORDER OF")
        ):
            raw_value = f"To the Order of {raw_value}"
        evidence = _field_evidence(parsed, snippet or raw_value or "", location)
        if raw_value is None:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.MISSING,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=evidence,
            )
        elif raw_value.strip().upper() in PLACEHOLDERS:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.PLACEHOLDER,
                raw_value=raw_value,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=evidence,
            )
        else:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.FOUND,
                raw_value=raw_value,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=evidence,
            )
        fields.append(normalize_extraction(extraction))

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
