from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.schemas.common import EmailCategory
from app.api.schemas.emails import EmailDetail, EmailListResponse
from app.api.schemas.review import (
    OverrideRequest,
    OverrideResponse,
    ResolveRequest,
    ResolveResponse,
    RetryRequest,
)
from app.services.dashboard_service import get_email_detail, to_email_item
from app.services.override_service import OverrideError, apply_category_override
from app.services.review_service import resolve_result

router = APIRouter(tags=["emails"])


@router.get("/emails", response_model=EmailListResponse)
def list_emails(
    request: Request,
    status: str | None = Query(default=None),
    category: EmailCategory | None = Query(default=None),
    query: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> EmailListResponse:
    request.app.state.orchestrator.ensure_seeded()
    loader = request.app.state.loader
    store = request.app.state.store
    results = {item.get("email_id"): item for item in store.list_latest_results()}
    all_meta = store.list_email_meta()
    items = [
        to_email_item(email, results.get(email["email_id"]), loader, all_meta.get(email["email_id"]))
        for email in loader.list_emails()
    ]
    status_map = {
        "ok": "OK",
        "no_mismatch": "OK",
        "mismatch": "MISMATCH",
        "needs_review": "NEEDS_REVIEW",
    }
    requested_status = status_map.get((status or "").lower(), status)
    if requested_status:
        items = [item for item in items if item.status and item.status.value == requested_status]
    if category:
        items = [item for item in items if item.category == category]
    if query:
        lowered = query.lower()
        items = [
            item
            for item in items
            if lowered in item.subject.lower()
            or lowered in item.sender.lower()
            or lowered in item.email_id.lower()
            or lowered in item.display_id.lower()
        ]
    total = len(items)
    start = (page - 1) * page_size
    return EmailListResponse(items=items[start : start + page_size], total=total, page=page, page_size=page_size)


@router.get("/emails/{email_id}", response_model=EmailDetail)
def email_detail(email_id: str, request: Request) -> EmailDetail:
    request.app.state.orchestrator.ensure_seeded()
    try:
        email = request.app.state.loader.get_email(email_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Email not found") from exc
    store = request.app.state.store
    result = store.get_result(email_id)
    return get_email_detail(email, result, request.app.state.loader, store.get_email_meta(email_id))


@router.post("/emails/{email_id}/retry")
def retry_email(email_id: str, request: Request, payload: RetryRequest | None = None) -> dict:
    try:
        email = request.app.state.loader.get_email(email_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Email not found") from exc
    run = request.app.state.orchestrator.run([email["email_id"]])
    return {"email_id": email_id, "run_id": run["run_id"], "status": run["status"]}


@router.post("/emails/{email_id}/override", response_model=OverrideResponse)
def override_category(email_id: str, payload: OverrideRequest, request: Request) -> OverrideResponse:
    try:
        outcome = apply_category_override(
            request.app.state.orchestrator,
            request.app.state.store,
            request.app.state.loader,
            email_id,
            payload.category,
            payload.actor,
        )
    except OverrideError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return OverrideResponse(email_id=email_id, result=outcome["result"], email_meta=outcome["email_meta"])


@router.post("/emails/{email_id}/resolve", response_model=ResolveResponse)
def resolve_email(email_id: str, payload: ResolveRequest, request: Request) -> ResolveResponse:
    try:
        result = resolve_result(request.app.state.store, email_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Result not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ResolveResponse(
        email_id=email_id,
        saved=True,
        message="Review decision saved",
        result=result,
    )
