from __future__ import annotations

from pydantic import BaseModel, Field

from .common import CanonicalField, ReviewAction


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
