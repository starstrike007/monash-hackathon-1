from __future__ import annotations

from pydantic import BaseModel, Field

from .emails import EmailListItem


class DashboardSummary(BaseModel):
    emails_processed: int = 0
    comparison_requests: int = 0
    mismatches_found: int = 0
    needs_review: int = 0
    categories: dict[str, int] = Field(default_factory=dict)
    outcomes: dict[str, int] = Field(default_factory=dict)
    defects_by_field: dict[str, int] = Field(default_factory=dict)
    attention: list[EmailListItem] = Field(default_factory=list)
    latest_run_id: str | None = None
