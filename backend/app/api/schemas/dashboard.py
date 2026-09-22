from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from .emails import EmailListItem


class DashboardProcessing(BaseModel):
    status: Literal["idle", "queued", "running", "complete", "ready", "failed"] = "ready"
    run_id: str | None = None
    total_emails: int = 0
    processed_count: int = 0
    percentage: int = 100
    stage: str = "Ready"
    message: str = "Dashboard data is ready."


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
    last_run_at: str | None = None
    review_queue_open: int = 0
    total_emails: int = 0
    processing: DashboardProcessing = Field(default_factory=DashboardProcessing)
