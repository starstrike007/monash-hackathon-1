from __future__ import annotations

import re

from backend.app.adapters.document_parsers import ParsedDocument
from backend.app.api.schemas.common import (
    CanonicalField,
    Confidence,
    DocumentRole,
    DocumentType,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    FieldExtraction,
    DocumentExtraction,
)
from backend.app.pipeline.normalize import normalize_extraction


FIELD_PATTERNS: dict[CanonicalField, tuple[str, ...]] = {
    CanonicalField.SHIPPER: (r"shipper(?:\s*/\s*exporter)?", r"shipper name", r"发货人"),
    CanonicalField.CONSIGNEE: (r"consignee(?:\s*\([^)]*\))?", r"收货人"),
    CanonicalField.NOTIFY_PARTY: (r"notify(?:\s+party)?", r"通知方"),
    CanonicalField.PORT_OF_LOADING: (
        r"port\s+of\s+loading(?:\s*\(\s*pol\s*\))?",
        r"load\s+port",
        r"\bpol\b",
        r"装货港",
    ),
    CanonicalField.PORT_OF_DISCHARGE: (
        r"port\s+of\s+discharge",
        r"discharge\s+port",
        r"\bpod\b",
        r"destination\s+port",
        r"卸货港",
    ),
    CanonicalField.CONTAINER_COUNT: (
        r"container\s+count",
        r"total\s+containers?",
        r"no\.?\s+of\s+containers?(?:\s+or\s+packages)?",
        r"containers?",
        r"集装箱",
    ),
    CanonicalField.GROSS_WEIGHT_KG: (
        r"gross\s+weight",
        r"gross\s+wt",
        r"gross\s+wt\.?\s*\(kgs?\)",
        r"毛重",
    ),
}

PLACEHOLDERS = {"", "TBA", "TBC", "N/A", "NA", "-", "_", "UNKNOWN", "TO BE ADVISED"}


def _find_value(text: str, patterns: tuple[str, ...]) -> tuple[str | None, str | None]:
    lines = text.replace("\r", "").split("\n")
    for index, line in enumerate(lines):
        stripped = line.strip().strip("|").strip()
        for pattern in patterns:
            match = re.search(
                rf"(?:^|\|)\s*{pattern}\s*(?:\([^)]*\))?\s*(?:[:：=\-]\s*)?(.*)$",
                stripped,
                flags=re.IGNORECASE,
            )
            if not match:
                continue
            value = match.group(1).strip(" .|;\t")
            if not value and index + 1 < len(lines):
                value = lines[index + 1].strip(" .|;\t")
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
        fields=fields,
    )
