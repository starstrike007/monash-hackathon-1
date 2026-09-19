from __future__ import annotations

from backend.app.adapters.local_store import LocalStore


def build_submission(store: LocalStore, email_ids: list[str]) -> dict[str, dict]:
    results = {result.get("email_id"): result for result in store.list_latest_results()}
    submission: dict[str, dict] = {}
    for email_id in email_ids:
        result = results.get(email_id)
        if result:
            submission[email_id] = {
                "category": result.get("category", "GENERAL"),
                "status": result.get("status") or "OK",
                "review_reason": result.get("review_reason"),
                "defect_fields": result.get("defect_fields", []),
                "has_defect": result.get("has_defect", False),
            }
        else:
            submission[email_id] = {
                "category": "GENERAL",
                "status": "OK",
                "review_reason": None,
                "defect_fields": [],
                "has_defect": False,
            }
    return submission
