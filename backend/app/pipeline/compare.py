from __future__ import annotations

from backend.app.api.schemas.common import (
    CanonicalField,
    DocumentExtraction,
    ExtractionState,
    FieldComparison,
)


CANONICAL_FIELDS = list(CanonicalField)


def compare_documents(si: DocumentExtraction, bl: DocumentExtraction) -> list[FieldComparison]:
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
            si_order = si_field.raw_value.upper().startswith("TO THE ORDER OF") if si_field.raw_value else False
            bl_order = bl_field.raw_value.upper().startswith("TO THE ORDER OF") if bl_field.raw_value else False
            if si_order != bl_order:
                result = "skipped"
                state = "uncertain"
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
