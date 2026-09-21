from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from app.adapters.local_store import LocalStore
from app.api.schemas.common import (
    FieldComparison,
    ReviewReason,
    Confidence,
    DocumentExtraction,
    DocumentRole,
    EmailCategory,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    ReviewAction,
    dump_model,
)
from app.api.schemas.review import ComparisonResultOverrideRequest, ResolveRequest
from app.pipeline.compare import compare_documents
from app.pipeline.decide import decide_result
from app.pipeline.normalize import normalize_field
from app.services.review_queue_service import sync_review_item


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve_result(store: LocalStore, email_id: str, request: ResolveRequest) -> dict:
    """Apply a human field decision, then run the normal compare/decide gates again."""

    current = store.get_result(email_id)
    if not current:
        raise KeyError(email_id)

    documents = [DocumentExtraction.model_validate(document) for document in current.get("documents", [])]
    si = next((document for document in documents if document.role == DocumentRole.SI), None)
    bl = next((document for document in documents if document.role == DocumentRole.BL), None)
    if si is None or bl is None:
        raise ValueError("Both SI and BL documents are required to resolve a field")

    si_field = next((field for field in si.fields if field.field_name == request.field_name), None)
    bl_field = next((field for field in bl.fields if field.field_name == request.field_name), None)
    if si_field is None or bl_field is None:
        raise ValueError(f"Field {request.field_name.value} is not available for review")

    unavailable = [field for field in (si_field, bl_field) if field.state != ExtractionState.FOUND]
    if request.action.value == "confirm_absent":
        target_field = unavailable[0] if len(unavailable) == 1 else bl_field
    elif request.action.value == "correct":
        target_field = unavailable[0] if len(unavailable) == 1 else bl_field
    else:
        target_field = bl_field if bl_field.state == ExtractionState.FOUND else si_field

    original = deepcopy(dump_model(target_field))
    # A reviewer may confirm a placeholder/missing reading from the legacy
    # confirm action. Treat that as an explicit confirmation that no usable
    # value exists; never turn TBA/N/A into a literal comparable value.
    confirm_unavailable = request.action.value == "confirm" and target_field.state != ExtractionState.FOUND
    mark_absent = request.action.value == "confirm_absent" or confirm_unavailable
    original_evidence = original.get("evidence") or {}
    if mark_absent:
        target_field.state = ExtractionState.MISSING
        target_field.raw_value = None
        target_field.normalized_value = None
        target_field.source = ExtractionSource.HUMAN
        target_field.confidence = Confidence.HIGH
        target_field.evidence = FieldEvidence(
            **{
                **original_evidence,
                "snippet": "Reviewer confirmed that no usable value is present.",
                "quoted_text": "Confirmed absent by reviewer",
                "source_path": target_field.evidence.source_path if target_field.evidence else None,
            }
        )
    else:
        if request.action.value == "correct":
            value = (request.corrected_value or "").strip()
            if not value:
                raise ValueError("corrected_value is required when correcting a field")
        else:
            value = (target_field.raw_value or "").strip()
            if not value:
                raise ValueError("This field has no reading to confirm; enter the correct value instead")
        target_field.state = ExtractionState.FOUND
        target_field.raw_value = value
        target_field.normalized_value = normalize_field(request.field_name, value)
        if target_field.normalized_value is None:
            raise ValueError("The corrected value could not be normalized")
        target_field.source = ExtractionSource.HUMAN
        target_field.confidence = Confidence.HIGH
        target_field.evidence = FieldEvidence(
            **{
                **original_evidence,
                "snippet": f"Human-reviewed value: {value}",
                "quoted_text": value,
                "source_path": target_field.evidence.source_path if target_field.evidence else None,
            }
        )

    comparisons = compare_documents(si, bl)
    if mark_absent:
        absent_comparison = next(
            (comparison for comparison in comparisons if comparison.field_name == request.field_name),
            None,
        )
        if absent_comparison is not None:
            absent_comparison.state = "mismatch"
            absent_comparison.result = "mismatch"
            absent_comparison.evidence = [target_field.evidence] if target_field.evidence else []

    result = decide_result(
        email_id=email_id,
        run_id=current.get("run_id") or "review",
        category=EmailCategory(current["category"]),
        comparisons=comparisons,
        documents=documents,
        notes=["Compare and decide rerun after a human review decision."],
    )
    payload = dump_model(result)
    payload["version"] = int(current.get("version", 1)) + 1
    payload["updated_at"] = _now()
    store.save_result(payload)
    store.add_review(
        {
            "email_id": email_id,
            "field_name": request.field_name.value,
            "action": request.action.value,
            "original_value": original.get("raw_value"),
            "corrected_value": request.corrected_value,
            "reviewer_id": request.reviewer_id,
            "created_at": _now(),
            "evidence": {"before": original, "after": dump_model(target_field)},
        }
    )
    sync_review_item(store, payload)
    store.add_audit_entry(
        {
            "email_id": email_id,
            "action": "review_resolved",
            "before": {"field_name": request.field_name.value, "value": original.get("raw_value")},
            "after": {
                "field_name": request.field_name.value,
                "value": target_field.raw_value,
                "state": target_field.state.value,
                "source": target_field.source.value if target_field.source else None,
            },
            "actor": request.reviewer_id,
            "evidence": {"before": original.get("evidence"), "after": dump_model(target_field.evidence)},
        }
    )
    return payload


def override_comparison_result(
    store: LocalStore,
    email_id: str,
    request: ComparisonResultOverrideRequest,
) -> dict:
    """Persist a human override of one deterministic comparison outcome."""

    current = store.get_result(email_id)
    if not current:
        raise KeyError(email_id)

    current_version = int(current.get("version", 1))
    if request.expected_version is not None and current_version != request.expected_version:
        raise ValueError("This comparison changed since it was loaded. Refresh and try again.")

    documents = [DocumentExtraction.model_validate(document) for document in current.get("documents", [])]
    si = next((document for document in documents if document.role == DocumentRole.SI), None)
    bl = next((document for document in documents if document.role == DocumentRole.BL), None)
    if si is not None and bl is not None:
        comparisons = compare_documents(si, bl)
    else:
        comparisons = [
            FieldComparison.model_validate(comparison)
            for comparison in current.get("comparisons", [])
        ]

    field_name = request.field_name.value
    target = next((comparison for comparison in comparisons if comparison.field_name == request.field_name), None)
    if target is None:
        raise ValueError(f"Field {field_name} is not available for comparison")

    before = deepcopy(dump_model(target))
    result_overrides = {
        str(key): value
        for key, value in (current.get("result_overrides") or {}).items()
        if value in {"match", "mismatch", "skipped"}
    }
    result_overrides[field_name] = request.result

    document_reason = None
    current_reason = current.get("review_reason")
    if current_reason in {
        ReviewReason.WRONG_DOC_TYPE.value,
        ReviewReason.MISSING_ATTACHMENT.value,
        ReviewReason.UNREADABLE.value,
    }:
        document_reason = ReviewReason(current_reason)

    decided = decide_result(
        email_id=email_id,
        run_id=current.get("run_id") or "review",
        category=EmailCategory(current["category"]),
        comparisons=comparisons,
        documents=documents,
        document_reason=document_reason,
        notes=["Comparison result manually overridden by a reviewer."],
        result_overrides=result_overrides,
    )
    payload = dump_model(decided)
    payload["version"] = current_version + 1
    payload["updated_at"] = _now()
    payload["result_overrides"] = result_overrides
    store.save_result(payload)

    after = dump_model(target)
    store.add_review(
        {
            "email_id": email_id,
            "field_name": field_name,
            "action": "result_override",
            "original_value": before.get("result"),
            "corrected_value": request.result,
            "reviewer_id": request.reviewer_id,
            "created_at": _now(),
            "evidence": {"before": before, "after": after, "result": request.result},
        }
    )
    sync_review_item(
        store,
        payload,
        cleared_resolution={
            "resolution": "human_result_override",
            "field_name": field_name,
            "result": request.result,
            "reviewer_id": request.reviewer_id,
        },
    )
    store.add_audit_entry(
        {
            "email_id": email_id,
            "action": "comparison_result_override",
            "before": {"field_name": field_name, "result": before.get("result")},
            "after": {
                "field_name": field_name,
                "result": request.result,
                "decision_source": "human",
            },
            "actor": request.reviewer_id,
            "evidence": {"before": before, "after": after},
        }
    )
    return payload
