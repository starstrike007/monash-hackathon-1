from __future__ import annotations

from collections import Counter
from typing import Any

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore
from app.api.schemas.common import ComparisonStatus, EmailCategory, dump_model
from app.api.schemas.dashboard import DashboardSummary
from app.api.schemas.emails import EmailDetail, EmailListItem


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


def to_email_item(
    email: dict[str, Any],
    result: dict[str, Any] | None,
    loader: DatasetLoader,
    meta: dict[str, Any] | None = None,
) -> EmailListItem:
    meta = meta or {}
    # The effective category is category_override when set, else the
    # pipeline's own decision - everything downstream (dashboard, exports,
    # lists) reads `category`, so it never needs to know about overrides.
    effective_category = meta.get("category_override") or (result.get("category") if result else None)
    excluded = set(meta.get("excluded_attachments") or [])
    paths: list[str] = []
    for path in [*(email.get("attachments") or []), *(meta.get("uploaded_attachments") or [])]:
        if path not in excluded and path not in paths:
            paths.append(path)
    return EmailListItem(
        email_id=email["email_id"],
        display_id=display_id(email["email_id"]),
        sender=email.get("from", ""),
        subject=email.get("subject", ""),
        received_at=meta.get("received_at"),
        attachments=attachment_meta(loader, paths),
        category=effective_category,
        category_machine=meta.get("category_machine"),
        category_override=meta.get("category_override"),
        classification_method=meta.get("classification_method"),
        classification_reason=meta.get("classification_reason"),
        status=result.get("status") if result else None,
        review_reason=result.get("review_reason") if result else None,
        defect_fields=result.get("defect_fields", []) if result else [],
        attention=(result.get("decision_notes") or [None])[0] if result else None,
    )


def get_email_detail(
    email: dict[str, Any],
    result: dict[str, Any] | None,
    loader: DatasetLoader,
    meta: dict[str, Any] | None = None,
) -> EmailDetail:
    item = to_email_item(email, result, loader, meta)
    return EmailDetail(**dump_model(item), body=email.get("body", ""), result=result)


def build_dashboard(
    emails: list[dict[str, Any]],
    store: LocalStore,
    loader: DatasetLoader,
) -> DashboardSummary:
    results = store.list_latest_results()
    by_email = {result.get("email_id"): result for result in results}
    all_meta = store.list_email_meta()
    items = [
        to_email_item(email, by_email.get(email["email_id"]), loader, all_meta.get(email["email_id"]))
        for email in emails
    ]
    categories = Counter(item.category.value for item in items if item.category)
    outcomes = Counter(item.status.value for item in items if item.status)
    defects = Counter(
        field
        for item in items
        for field in (by_email.get(item.email_id) or {}).get("defect_fields", [])
        if item.category == EmailCategory.BL_COMPARISON
    )
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
        last_run_at=(latest_run.get("finished_at") or latest_run.get("started_at")) if latest_run else None,
        review_queue_open=len(store.list_review_items(status="open")),
    )
