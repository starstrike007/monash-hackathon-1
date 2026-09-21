from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request

from app.api.schemas.review import ReviewItem, ReviewItemListResponse, ReviewItemResolveRequest
from app.services.review_item_service import ReviewItemError, resolve_review_item

router = APIRouter(tags=["review"])


@router.get("/review/items", response_model=ReviewItemListResponse)
def list_review_items(
    request: Request,
    status: str | None = Query(default=None),
    reason: str | None = Query(default=None),
    email_id: str | None = Query(default=None),
) -> ReviewItemListResponse:
    request.app.state.orchestrator.ensure_seeded()
    store = request.app.state.store
    items = store.list_review_items(status=status, email_id=email_id)
    if reason:
        items = [item for item in items if item.get("reason") == reason]
    open_count = len(store.list_review_items(status="open"))
    return ReviewItemListResponse(items=items, total=len(items), open_count=open_count)


@router.get("/review/items/{item_id}", response_model=ReviewItem)
def get_review_item(item_id: str, request: Request) -> ReviewItem:
    request.app.state.orchestrator.ensure_seeded()
    item = request.app.state.store.get_review_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Review item not found")
    return ReviewItem(**item)


@router.post("/review/items/{item_id}/resolve")
def resolve_review_item_route(item_id: str, payload: ReviewItemResolveRequest, request: Request) -> dict:
    try:
        outcome = resolve_review_item(
            request.app.state.orchestrator,
            request.app.state.store,
            request.app.state.loader,
            item_id,
            payload,
        )
    except ReviewItemError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return outcome
