from __future__ import annotations

import base64
import binascii
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore
from app.api.schemas.common import EmailCategory, ReviewAction, dump_model
from app.api.schemas.review import ResolveRequest, ReviewItemResolveRequest
from app.pipeline.orchestrator import PipelineOrchestrator
from app.services.override_service import OverrideError, apply_category_override
from app.services.review_service import resolve_result
from app.services.review_queue_service import sync_review_item


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ReviewItemError(ValueError):
    pass


def _upload_attachment(
    store: LocalStore,
    loader: DatasetLoader,
    email_id: str,
    payload: ReviewItemResolveRequest,
) -> tuple[str, str]:
    role = (payload.role or "").upper()
    if role not in {"SI", "BL"}:
        raise ReviewItemError("role must be SI or BL")
    filename = Path(payload.filename or "").name
    extension = Path(filename).suffix.lower()
    if extension not in {".txt", ".pdf", ".docx", ".xlsx"}:
        raise ReviewItemError("Only .txt, .pdf, .docx, and .xlsx attachments are supported")
    if not payload.content_base64:
        raise ReviewItemError("content_base64 is required for an uploaded attachment")
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ReviewItemError("The uploaded attachment was not valid base64") from exc
    if not content:
        raise ReviewItemError("The uploaded attachment is empty")
    if len(content) > 15 * 1024 * 1024:
        raise ReviewItemError("The uploaded attachment is larger than 15 MB")

    runtime_dir = loader.runtime_dir or store.runtime_dir
    loader.runtime_dir = Path(runtime_dir).resolve()
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", filename) or f"attachment{extension}"
    relative_path = f"uploads/{email_id}/{uuid4().hex[:12]}-{safe_name}"
    target = loader.runtime_dir / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    store.append_email_attachment(email_id, relative_path)
    return relative_path, role


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

    if action in {"confirm", "correct", "confirm_absent"}:
        if not payload.field_name:
            raise ReviewItemError("field_name is required to resolve a value")
        action_map = {
            "confirm": ReviewAction.CONFIRM,
            "correct": ReviewAction.CORRECT,
            "confirm_absent": ReviewAction.CONFIRM_ABSENT,
        }
        try:
            result = resolve_result(
                store,
                email_id,
                ResolveRequest(
                    field_name=payload.field_name,
                    action=action_map[action],
                    corrected_value=payload.corrected_value,
                    reviewer_id=payload.reviewer_id,
                ),
            )
        except (KeyError, ValueError) as exc:
            raise ReviewItemError(str(exc)) from exc
        return {"email_id": email_id, "result": result, "review_item": store.get_review_item(item_id)}

    if action == "upload_missing":
        before = {"uploaded_attachments": (store.get_email_meta(email_id) or {}).get("uploaded_attachments", [])}
        path, role = _upload_attachment(store, loader, email_id, payload)
        run = orchestrator.run([email_id])
        result = store.get_result(email_id)
        store.add_audit_entry(
            {
                "email_id": email_id,
                "action": "review_upload",
                "before": before,
                "after": {"path": path, "role": role, "run_id": run.get("run_id")},
                "actor": payload.reviewer_id,
                "evidence": {"path": path, "role": role, "filename": payload.filename},
            }
        )
        return {"email_id": email_id, "result": result, "review_item": store.get_review_item(item_id)}

    if action == "reclassify":
        try:
            outcome = apply_category_override(
                orchestrator,
                store,
                loader,
                email_id,
                payload.new_category or EmailCategory.GENERAL,
                payload.reviewer_id,
            )
        except OverrideError as exc:
            raise ReviewItemError(str(exc)) from exc
        return {"email_id": email_id, "result": outcome["result"], "review_item": store.get_review_item(item_id)}

    if action == "reassign_roles":
        if not payload.si_path or not payload.bl_path:
            raise ReviewItemError("si_path and bl_path are required to reassign document roles")
        email = loader.get_email(email_id)
        run = store.create_run(1)
        store.update_run(run["run_id"], status="running", started_at=utc_now())
        result = orchestrator.process_email_with_roles(email, run["run_id"], payload.si_path, payload.bl_path)
        result_payload = dump_model(result)
        store.save_result(result_payload)
        store.update_run(run["run_id"], status="complete", finished_at=utc_now(), summary={result.category.value: 1})
        sync_review_item(store, result_payload)
        store.add_audit_entry(
            {
                "email_id": email_id,
                "action": "review_resolved",
                "before": {"reason": "wrong_doc_type"},
                "after": {"si_path": payload.si_path, "bl_path": payload.bl_path},
                "actor": payload.reviewer_id,
                "evidence": {"documents": result_payload.get("documents", [])},
            }
        )
        return {"email_id": email_id, "result": result_payload, "review_item": store.get_review_item(item_id)}

    if action == "mark_missing":
        missing_role = (payload.missing_role or "").upper()
        if missing_role not in {"SI", "BL"}:
            raise ReviewItemError("missing_role must be SI or BL")
        current = store.get_result(email_id) or {}
        candidate = payload.missing_path or next(
            (document.get("path") for document in current.get("documents", []) if document.get("role") == missing_role),
            None,
        )
        if not candidate:
            raise ReviewItemError("No document was available to mark missing")
        meta = store.get_email_meta(email_id) or {}
        excluded = list(meta.get("excluded_attachments") or [])
        if candidate not in excluded:
            excluded.append(candidate)
        store.upsert_email_meta(email_id, excluded_attachments=excluded)
        run = orchestrator.run([email_id])
        result = store.get_result(email_id)
        store.update_review_item(
            item_id,
            status="resolved",
            resolved_at=utc_now(),
            resolution={"resolution": "document_marked_missing", "missing_role": missing_role, "path": candidate},
        )
        if result:
            sync_review_item(store, result)
        store.add_audit_entry(
            {
                "email_id": email_id,
                "action": "review_mark_missing",
                "before": {"path": candidate, "role": missing_role},
                "after": {"excluded_attachments": excluded, "run_id": run.get("run_id")},
                "actor": payload.reviewer_id,
                "evidence": {"path": candidate, "role": missing_role},
            }
        )
        return {"email_id": email_id, "result": result, "review_item": store.get_review_item(item_id)}

    if action == "retry":
        orchestrator.run([email_id])
        return {
            "email_id": email_id,
            "result": store.get_result(email_id),
            "review_item": store.get_review_item(item_id),
        }

    raise ReviewItemError(f"Unsupported review action: {action}")
