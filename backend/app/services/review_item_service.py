from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore
from app.api.schemas.common import EmailCategory, dump_model
from app.api.schemas.review import ResolveRequest, ReviewItemResolveRequest
from app.pipeline.orchestrator import PipelineOrchestrator
from app.services.override_service import OverrideError, apply_category_override
from app.services.review_service import resolve_result


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ReviewItemError(ValueError):
    pass


def resolve_review_item(
    orchestrator: PipelineOrchestrator,
    store: LocalStore,
    loader: DatasetLoader,
    item_id: str,
    payload: ReviewItemResolveRequest,
) -> dict[str, Any]:
    item = store.get_review_item(item_id)
    if not item:
        raise ReviewItemError(f"Review item {item_id} was not found")
    email_id = item["email_id"]
    action = payload.action

    if action in {"confirm", "correct"}:
        # unreadable / missing_value: confirm the extracted reading, or supply
        # the correct value - both recompute compare/decide deterministically.
        if not payload.field_name:
            raise ReviewItemError("field_name is required to confirm or correct a value")
        from app.api.schemas.common import ReviewAction

        result = resolve_result(
            store,
            email_id,
            ResolveRequest(
                field_name=payload.field_name,
                action=ReviewAction.CONFIRM if action == "confirm" else ReviewAction.CORRECT,
                corrected_value=payload.corrected_value,
                reviewer_id=payload.reviewer_id,
            ),
        )
        return {"email_id": email_id, "result": result, "review_item": store.get_review_item(item_id)}

    if action == "reclassify":
        # missing_attachment / any reason: not actually a comparison request.
        try:
            outcome = apply_category_override(
                orchestrator, store, loader, email_id, payload.new_category or EmailCategory.GENERAL, payload.reviewer_id
            )
        except OverrideError as exc:
            raise ReviewItemError(str(exc)) from exc
        return {
            "email_id": email_id,
            "result": outcome["result"],
            "review_item": store.get_review_item(item_id),
        }

    if action == "reassign_roles":
        # wrong_doc_type: reviewer picks which attachment is the SI and which is the BL.
        if not payload.si_path or not payload.bl_path:
            raise ReviewItemError("si_path and bl_path are required to reassign document roles")
        email = loader.get_email(email_id)
        run = store.create_run(1)
        store.update_run(run["run_id"], status="running", started_at=utc_now())
        result = orchestrator.process_email_with_roles(email, run["run_id"], payload.si_path, payload.bl_path)
        store.save_result(dump_model(result))
        store.update_run(run["run_id"], status="complete", finished_at=utc_now(), summary={result.category.value: 1})
        from app.services.review_queue_service import sync_review_item

        sync_review_item(store, dump_model(result))
        store.add_audit_entry(
            {
                "email_id": email_id,
                "action": "review_resolved",
                "before": {"reason": "wrong_doc_type"},
                "after": {"si_path": payload.si_path, "bl_path": payload.bl_path},
                "actor": payload.reviewer_id,
            }
        )
        return {"email_id": email_id, "result": dump_model(result), "review_item": store.get_review_item(item_id)}

    if action == "retry":
        # processing_failed: rerun this email only.
        orchestrator.run([email_id])
        return {
            "email_id": email_id,
            "result": store.get_result(email_id),
            "review_item": store.get_review_item(item_id),
        }

    raise ReviewItemError(f"Unsupported review action: {action}")
