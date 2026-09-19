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
from app.pipeline.normalize import normalize_extraction


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


def _find_value(text: str, patterns: tuple[str, ...]) -> tuple[str | None, str | None]:
    lines = text.replace("\r", "").split("\n")
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
            if not value and index + 1 < len(lines):
                value = lines[index + 1].strip(" .|;\t")
            if value and pattern.lower().startswith(r"to\s+the\s+order\s+of"):
                value = f"To the Order of {value}"
            return (value or None), stripped
    return None, None


def extract_document(parsed: ParsedDocument, role: DocumentRole | None = None) -> DocumentExtraction:
    fields: list[FieldExtraction] = []
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

        raw_value, snippet = _find_value(parsed.text, patterns)
        if raw_value is None:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.MISSING,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=FieldEvidence(snippet=snippet or "", source_path=parsed.path),
            )
        elif raw_value.strip().upper() in PLACEHOLDERS:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.PLACEHOLDER,
                raw_value=raw_value,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=FieldEvidence(snippet=snippet or raw_value, source_path=parsed.path),
            )
        else:
            extraction = FieldExtraction(
                field_name=field_name,
                state=ExtractionState.FOUND,
                raw_value=raw_value,
                source=ExtractionSource.RULE,
                confidence=Confidence.HIGH,
                evidence=FieldEvidence(snippet=snippet or raw_value, source_path=parsed.path),
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
