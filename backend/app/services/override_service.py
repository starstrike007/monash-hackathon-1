from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore
from app.api.schemas.common import EmailCategory, dump_model
from app.pipeline.decide import decide_result
from app.pipeline.orchestrator import PipelineOrchestrator
from app.services.review_queue_service import close_reviews_for_reclassify, sync_review_item


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class OverrideError(ValueError):
    pass


def apply_category_override(
    orchestrator: PipelineOrchestrator,
    store: LocalStore,
    loader: DatasetLoader,
    email_id: str,
    new_category: EmailCategory | None,
    actor: str,
) -> dict[str, Any]:
    """Set (or clear, when `new_category` is None) a category override and run
    the ripple effects described in the product spec: reprocess the email
    when it becomes a comparison, close stale review items when it stops
    being one, and always record the change in the audit log."""

    meta = store.get_email_meta(email_id) or {}
    category_machine = meta.get("category_machine")
    if new_category is None and not category_machine:
        raise OverrideError("This email has no machine category on record to revert to.")

    before_effective = meta.get("category_override") or category_machine
    target = new_category or EmailCategory(category_machine)

    store.upsert_email_meta(
        email_id,
        category_override=new_category.value if new_category else None,
        override_by=actor if new_category else None,
        override_at=utc_now() if new_category else None,
    )

    try:
        email = loader.get_email(email_id)
    except FileNotFoundError as exc:
        raise OverrideError(f"Email {email_id} was not found") from exc

    run = store.create_run(1)
    store.update_run(run["run_id"], status="running", started_at=utc_now())

    if target == EmailCategory.BL_COMPARISON:
        result = orchestrator.process_email(email, run["run_id"], category=EmailCategory.BL_COMPARISON)
        store.save_result(dump_model(result))
        sync_review_item(store, dump_model(result))
    else:
        result = decide_result(
            email_id=email_id,
            run_id=run["run_id"],
            category=target,
            comparisons=[],
            documents=[],
            notes=["Reclassified away from document comparison by a reviewer."],
        )
        store.save_result(dump_model(result))
        close_reviews_for_reclassify(store, email_id)

    store.update_run(
        run["run_id"],
        status="complete",
        finished_at=utc_now(),
        summary={target.value: 1},
    )
    store.add_audit_entry(
        {
            "email_id": email_id,
            "action": "category_override" if new_category else "category_revert",
            "before": {"category": before_effective},
            "after": {"category": target.value},
            "actor": actor,
        }
    )
    return {"result": store.get_result(email_id), "email_meta": store.get_email_meta(email_id)}
