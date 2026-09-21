from __future__ import annotations

from app.adapters.local_store import LocalStore
from app.api.schemas.common import SubmissionRow
from app.services.review_queue_service import to_export_reason


def build_submission(store: LocalStore, email_ids: list[str]) -> dict[str, dict]:
    """Build the evaluator-shaped submission.

    A result that never finished (a processing failure with no saved
    ResultRecord) must never silently read as OK: if it still has an open
    review item, the row reflects NEEDS_REVIEW/unreadable instead - an
    uncertain outcome never resolves to a clean one just because the
    pipeline didn't get to decide.
    """

    results = {result.get("email_id"): result for result in store.list_latest_results()}
    open_reasons = {
        item["email_id"]: item.get("reason")
        for item in store.list_review_items(status="open")
        if item.get("email_id")
    }
    email_meta = store.list_email_meta()
    submission: dict[str, dict] = {}
    for email_id in email_ids:
        result = results.get(email_id)
        open_reason = open_reasons.get(email_id)
        if result:
            status = result.get("status") or "OK"
            review_reason = result.get("review_reason")
            if open_reason and not review_reason:
                status = "NEEDS_REVIEW"
                review_reason = to_export_reason(open_reason)
            submission[email_id] = SubmissionRow(
                category=result.get("category", "GENERAL"),
                status=status,
                review_reason=review_reason,
                defect_fields=result.get("defect_fields", []),
                has_defect=result.get("has_defect") is True,
            ).model_dump(mode="json")
        else:
            meta = email_meta.get(email_id, {})
            category = meta.get("category_override") or meta.get("category_machine") or "GENERAL"
            if open_reason:
                submission[email_id] = SubmissionRow(
                    category=category,
                    status="NEEDS_REVIEW",
                    review_reason=to_export_reason(open_reason),
                ).model_dump(mode="json")
            else:
                submission[email_id] = SubmissionRow(
                    category=category,
                    status="OK",
                ).model_dump(mode="json")
    return submission
