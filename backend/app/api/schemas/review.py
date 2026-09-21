from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .common import CanonicalField, EmailCategory, ReviewAction


class RetryRequest(BaseModel):
    run_id: str | None = None


class ResolveRequest(BaseModel):
    field_name: CanonicalField
    action: ReviewAction
    corrected_value: str | None = None
    reviewer_id: str = "local-reviewer"
    expected_version: int | None = None


class ResolveResponse(BaseModel):
    email_id: str
    saved: bool
    message: str
    result: dict = Field(default_factory=dict)


class OverrideRequest(BaseModel):
    category: EmailCategory | None = None  # None reverts to the machine category
    actor: str = "local-reviewer"


class OverrideResponse(BaseModel):
    email_id: str
    result: dict | None = None
    email_meta: dict = Field(default_factory=dict)


class ReviewItem(BaseModel):
    id: str
    email_id: str
    reason: str
    status: str
    description: str | None = None
    evidence: dict = Field(default_factory=dict)
    created_at: datetime | None = None
    resolved_at: datetime | None = None
    resolution: dict | None = None


class ReviewItemListResponse(BaseModel):
    items: list[ReviewItem]
    total: int
    open_count: int


class ReviewItemResolveRequest(BaseModel):
    """Reason-specific resolution payload for one review queue item.

    Only the fields relevant to the item's reason need to be set; unused
    fields are ignored by the handler for that reason.
    """

    action: str  # confirm | correct | upload_missing | reclassify | draft_reply | reassign_roles | mark_missing | retry
    field_name: CanonicalField | None = None
    corrected_value: str | None = None
    new_category: EmailCategory | None = None
    si_path: str | None = None
    bl_path: str | None = None
    reviewer_id: str = "local-reviewer"
    note: str | None = None
