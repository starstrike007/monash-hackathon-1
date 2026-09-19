from __future__ import annotations

from datetime import datetime, timezone

from backend.app.adapters.local_store import LocalStore
from backend.app.api.schemas.common import ComparisonStatus, ReviewAction, dump_model
from backend.app.api.schemas.review import ResolveRequest


def resolve_result(store: LocalStore, email_id: str, request: ResolveRequest) -> dict:
    current = store.get_result(email_id)
    if not current:
        raise KeyError(email_id)
    comparisons = current.get("comparisons", [])
    target = next(
        (comparison for comparison in comparisons if comparison.get("field_name") == request.field_name.value),
        None,
    )
    if target is None:
        raise ValueError(f"Field {request.field_name.value} is not available for review")

    si = target.get("si") or {}
    bl = target.get("bl") or {}
    original_value = bl.get("raw_value")
    if request.action == ReviewAction.CORRECT:
        if not request.corrected_value:
            raise ValueError("corrected_value is required when correcting a field")
        bl["raw_value"] = request.corrected_value
        bl["normalized_value"] = si.get("normalized_value") or request.corrected_value
        target["result"] = "match"
        target["state"] = "match"
    else:
        target["result"] = "mismatch" if si.get("normalized_value") != bl.get("normalized_value") else "match"
        target["state"] = target["result"]

    current["skipped_fields"] = [
        field for field in current.get("skipped_fields", []) if field != request.field_name.value
    ]
    current["defect_fields"] = [
        comparison.get("field_name")
        for comparison in comparisons
        if comparison.get("result") == "mismatch"
    ]
    current["has_defect"] = bool(current["defect_fields"])
    current["status"] = (
        ComparisonStatus.MISMATCH.value if current["defect_fields"] else ComparisonStatus.OK.value
    )
    current["review_reason"] = None
    current["version"] = int(current.get("version", 1)) + 1
    current["updated_at"] = datetime.now(timezone.utc).isoformat()
    store.save_result(current)
    store.add_review(
        {
            "email_id": email_id,
            "field_name": request.field_name.value,
            "action": request.action.value,
            "original_value": original_value,
            "corrected_value": request.corrected_value,
            "reviewer_id": request.reviewer_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    return current
