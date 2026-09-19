from __future__ import annotations

from collections import Counter
from typing import Any

from backend.app.adapters.dataset_loader import DatasetLoader
from backend.app.adapters.local_store import LocalStore
from backend.app.api.schemas.common import ComparisonStatus, EmailCategory, dump_model
from backend.app.api.schemas.dashboard import DashboardSummary
from backend.app.api.schemas.emails import EmailDetail, EmailListItem


def display_id(email_id: str) -> str:
    try:
        return f"EM-{int(email_id.rsplit('_', 1)[1]):04d}"
    except (IndexError, ValueError):
        return email_id.upper()


def attachment_meta(loader: DatasetLoader, paths: list[str]) -> list[dict[str, Any]]:
    return [
        {
            "path": path,
            "filename": path.rsplit("/", 1)[-1],
            "extension": path.rsplit(".", 1)[-1].lower() if "." in path else "",
            "size_bytes": loader.attachment_size(path),
        }
        for path in paths
    ]


def to_email_item(email: dict[str, Any], result: dict[str, Any] | None, loader: DatasetLoader) -> EmailListItem:
    return EmailListItem(
        email_id=email["email_id"],
        display_id=display_id(email["email_id"]),
        sender=email.get("from", ""),
        subject=email.get("subject", ""),
        attachments=attachment_meta(loader, email.get("attachments", [])),
        category=result.get("category") if result else None,
        status=result.get("status") if result else None,
        review_reason=result.get("review_reason") if result else None,
        attention=(result.get("decision_notes") or [None])[0] if result else None,
    )


def get_email_detail(email: dict[str, Any], result: dict[str, Any] | None, loader: DatasetLoader) -> EmailDetail:
    item = to_email_item(email, result, loader)
    return EmailDetail(**dump_model(item), body=email.get("body", ""), result=result)


def build_dashboard(
    emails: list[dict[str, Any]],
    store: LocalStore,
    loader: DatasetLoader,
) -> DashboardSummary:
    results = store.list_latest_results()
    by_email = {result.get("email_id"): result for result in results}
    categories = Counter(result.get("category") for result in results if result.get("category"))
    outcomes = Counter(result.get("status") for result in results if result.get("status"))
    defects = Counter(
        field
        for result in results
        for field in result.get("defect_fields", [])
    )
    items = [to_email_item(email, by_email.get(email["email_id"]), loader) for email in emails]
    attention = [item for item in items if item.status == ComparisonStatus.NEEDS_REVIEW][:6]
    latest_run = store.latest_run()
    return DashboardSummary(
        emails_processed=len(emails),
        comparison_requests=categories.get(EmailCategory.BL_COMPARISON.value, 0),
        mismatches_found=outcomes.get(ComparisonStatus.MISMATCH.value, 0),
        needs_review=outcomes.get(ComparisonStatus.NEEDS_REVIEW.value, 0),
        categories=dict(categories),
        outcomes=dict(outcomes),
        defects_by_field=dict(defects),
        attention=attention,
        latest_run_id=latest_run.get("run_id") if latest_run else None,
    )
