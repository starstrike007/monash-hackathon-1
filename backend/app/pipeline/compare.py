from __future__ import annotations

import re

from app.api.schemas.common import (
    CanonicalField,
    DocumentExtraction,
    ExtractionState,
    FieldComparison,
)
from app.pipeline.normalize import normalize_name
from app.settings import settings


CANONICAL_FIELDS = list(CanonicalField)
ORDER_MODE_POLICIES = {"review", "same_party_match", "always_mismatch"}


def _is_order_mode(raw_value: str | None) -> bool:
    return bool(raw_value and re.match(r"^\s*TO\s+THE\s+ORDER\s+OF\b", raw_value, re.IGNORECASE))


def _order_mode_party(raw_value: str | None) -> str:
    value = re.sub(
        r"^\s*TO\s+THE\s+ORDER\s+OF(?:\s*\([^)]*\))?\s*:?\s*",
        "",
        raw_value or "",
        flags=re.IGNORECASE,
    )
    return normalize_name(value)


def _resolve_order_mode_policy(value: str | None) -> str:
    policy = (value or settings.order_mode_policy).strip().lower()
    if policy not in ORDER_MODE_POLICIES:
        raise ValueError(f"Unsupported order-mode policy: {policy}")
    return policy


def compare_documents(
    si: DocumentExtraction,
    bl: DocumentExtraction,
    *,
    order_mode_policy: str | None = None,
) -> list[FieldComparison]:
    resolved_order_mode_policy = _resolve_order_mode_policy(order_mode_policy)
    comparisons: list[FieldComparison] = []
    si_by_field = {field.field_name: field for field in si.fields}
    bl_by_field = {field.field_name: field for field in bl.fields}

    for field_name in CANONICAL_FIELDS:
        si_field = si_by_field.get(field_name)
        bl_field = bl_by_field.get(field_name)
        if not si_field or not bl_field:
            comparisons.append(
                FieldComparison(field_name=field_name, si=si_field, bl=bl_field, state="uncertain", result="skipped")
            )
            continue
        if si_field.state != ExtractionState.FOUND or bl_field.state != ExtractionState.FOUND:
            comparisons.append(
                FieldComparison(
                    field_name=field_name,
                    si=si_field,
                    bl=bl_field,
                    state="uncertain",
                    result="skipped",
                    evidence=[item for item in (si_field.evidence, bl_field.evidence) if item],
                )
            )
            continue

        si_value = si_field.normalized_value
        bl_value = bl_field.normalized_value
        if not si_value or not bl_value:
            result = "skipped"
            state = "uncertain"
        elif field_name == CanonicalField.CONSIGNEE:
            si_order = _is_order_mode(si_field.raw_value)
            bl_order = _is_order_mode(bl_field.raw_value)
            if si_order != bl_order:
                if resolved_order_mode_policy == "review":
                    result = "skipped"
                    state = "uncertain"
                elif resolved_order_mode_policy == "always_mismatch":
                    result = "mismatch"
                    state = "mismatch"
                else:
                    si_party = _order_mode_party(si_field.raw_value) if si_order else normalize_name(si_field.raw_value or "")
                    bl_party = _order_mode_party(bl_field.raw_value) if bl_order else normalize_name(bl_field.raw_value or "")
                    result = "match" if si_party == bl_party else "mismatch"
                    state = result
            else:
                result = "match" if si_value == bl_value else "mismatch"
                state = result
        else:
            result = "match" if si_value == bl_value else "mismatch"
            state = result
        comparisons.append(
            FieldComparison(
                field_name=field_name,
                si=si_field,
                bl=bl_field,
                state=state,
                result=result,
                evidence=[item for item in (si_field.evidence, bl_field.evidence) if item],
            )
        )
    return comparisons
