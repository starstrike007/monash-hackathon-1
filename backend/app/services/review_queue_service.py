from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.adapters.local_store import LocalStore

# Internal reasons are richer than the four the evaluator accepts; this maps
# them down at export time only. `processing_failed` has no export-shaped
# equivalent, so it is treated as `unreadable` (the pipeline could not read
# what it needed to decide).
EXPORT_REASON_MAP: dict[str, str] = {
    "processing_failed": "unreadable",
}

REASON_DESCRIPTIONS: dict[str, str] = {
    "unreadable": "The attached document could not be read as text or an image.",
    "missing_attachment": "The email is missing the SI or BL attachment needed to compare.",
    "missing_value": "One or more of the seven compared fields could not be found in a document.",
    "wrong_doc_type": "The attachments could not be resolved unambiguously into one SI and one BL.",
    "processing_failed": "Processing this email failed. Retry to try again.",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_export_reason(reason: str | None) -> str | None:
    if reason is None:
        return None
    return EXPORT_REASON_MAP.get(reason, reason)


def _evidence_for_result(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "selected_si_path": result.get("selected_si_path"),
        "selected_bl_path": result.get("selected_bl_path"),
        "documents": [
            {
                "path": document.get("path"),
                "role": document.get("role"),
                "readable": document.get("readable"),
                "document_type": document.get("document_type"),
            }
            for document in result.get("documents", [])
        ],
        "skipped_fields": result.get("skipped_fields", []),
    }


def sync_review_item(store: LocalStore, result: dict[str, Any]) -> None:
    """Keep exactly one open deterministic review item per email in sync with
    its latest result, without duplicating it on retries/reruns."""

    email_id = result.get("email_id")
    if not email_id:
        return
    existing_open = next(
        (
            item
            for item in store.list_review_items(email_id=email_id, status="open")
            if item.get("reason") != "processing_failed"
        ),
        None,
    )
    reason = result.get("review_reason")
    if result.get("status") == "NEEDS_REVIEW" and reason:
        description = REASON_DESCRIPTIONS.get(reason, "This case needs a person to confirm the result.")
        evidence = _evidence_for_result(result)
        if existing_open:
            store.update_review_item(existing_open["id"], reason=reason, description=description, evidence=evidence)
        else:
            store.add_review_item(
                {
                    "email_id": email_id,
                    "reason": reason,
                    "status": "open",
                    "description": description,
                    "evidence": evidence,
                }
            )
    elif existing_open:
        store.update_review_item(
            existing_open["id"],
            status="resolved",
            resolved_at=utc_now(),
            resolution={"resolution": "auto_cleared", "note": "Recomputed without a review reason."},
        )


def sync_processing_failure(store: LocalStore, email_id: str, message: str) -> None:
    existing = next(
        (
            item
            for item in store.list_review_items(email_id=email_id, status="open")
            if item.get("reason") == "processing_failed"
        ),
        None,
    )
    description = f"Processing failed: {message}"[:400]
    evidence = {"message": message}
    if existing:
        store.update_review_item(existing["id"], description=description, evidence=evidence)
    else:
        store.add_review_item(
            {
                "email_id": email_id,
                "reason": "processing_failed",
                "status": "open",
                "description": description,
                "evidence": evidence,
            }
        )


def clear_processing_failure(store: LocalStore, email_id: str) -> None:
    for item in store.list_review_items(email_id=email_id, status="open"):
        if item.get("reason") == "processing_failed":
            store.update_review_item(
                item["id"], status="resolved", resolved_at=utc_now(), resolution={"resolution": "retried"}
            )


def close_reviews_for_reclassify(store: LocalStore, email_id: str) -> None:
    for item in store.list_review_items(email_id=email_id, status="open"):
        store.update_review_item(
            item["id"], status="resolved", resolved_at=utc_now(), resolution={"resolution": "reclassified"}
        )
