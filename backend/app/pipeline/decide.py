from __future__ import annotations

from datetime import datetime, timezone

from app.api.schemas.common import (
    ComparisonStatus,
    EmailCategory,
    ReviewReason,
    ResultRecord,
)


def decide_result(
    *,
    email_id: str,
    run_id: str,
    category: EmailCategory,
    comparisons: list,
    documents: list,
    document_reason: ReviewReason | None = None,
    notes: list[str] | None = None,
    result_overrides: dict[str, str] | None = None,
) -> ResultRecord:
    result_overrides = result_overrides or {}
    for comparison in comparisons:
        field_name = getattr(comparison.field_name, "value", comparison.field_name)
        override = result_overrides.get(field_name)
        if override in {"match", "mismatch", "skipped"}:
            comparison.result = override
            comparison.state = "uncertain" if override == "skipped" else override

    selected_si_path = next(
        (document.path for document in documents if document.role and document.role.value == "SI"),
        None,
    )
    selected_bl_path = next(
        (document.path for document in documents if document.role and document.role.value == "BL"),
        None,
    )
    if category != EmailCategory.BL_COMPARISON:
        return ResultRecord(
            email_id=email_id,
            run_id=run_id,
            category=category,
            status=None,
            has_defect=None,
            selected_si_path=selected_si_path,
            selected_bl_path=selected_bl_path,
            comparisons=comparisons,
            result_overrides=result_overrides,
            documents=documents,
            decision_notes=notes or [],
            updated_at=datetime.now(timezone.utc),
        )

    defect_fields = [item.field_name for item in comparisons if item.result == "mismatch"]
    skipped_fields = [item.field_name for item in comparisons if item.result == "skipped"]

    if document_reason:
        status = ComparisonStatus.NEEDS_REVIEW
        has_defect = None
        review_reason = document_reason
    elif skipped_fields:
        status = ComparisonStatus.NEEDS_REVIEW
        has_defect = None
        review_reason = ReviewReason.MISSING_VALUE
    elif defect_fields:
        status = ComparisonStatus.MISMATCH
        has_defect = True
        review_reason = None
    else:
        status = ComparisonStatus.OK
        has_defect = False
        review_reason = None

    return ResultRecord(
        email_id=email_id,
        run_id=run_id,
        category=category,
        status=status,
        review_reason=review_reason,
        has_defect=has_defect,
        defect_fields=defect_fields,
        skipped_fields=skipped_fields,
        selected_si_path=selected_si_path,
        selected_bl_path=selected_bl_path,
        comparisons=comparisons,
        result_overrides=result_overrides,
        documents=documents,
        decision_notes=notes or [],
        updated_at=datetime.now(timezone.utc),
    )
