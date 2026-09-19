from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .common import PipelineRunStatus, PipelineStageStatus


class PipelineRunRequest(BaseModel):
    email_ids: list[str] | None = None
    retry_failed_only: bool = False


class PipelineRun(BaseModel):
    run_id: str
    status: PipelineRunStatus
    started_at: datetime | None = None
    finished_at: datetime | None = None
    total_emails: int = 0
    summary: dict[str, int] = Field(default_factory=dict)
    error_summary: dict[str, int] = Field(default_factory=dict)


class PipelineStageProgress(BaseModel):
    stage_number: int
    stage_name: str
    status: PipelineStageStatus
    processed_count: int = 0
    total_count: int = 0
    failed_count: int = 0
    review_count: int = 0
    details: dict = Field(default_factory=dict)


class PipelineFailure(BaseModel):
    email_id: str
    message: str
    retryable: bool = True


class PipelineRunDetail(PipelineRun):
    stages: list[PipelineStageProgress] = Field(default_factory=list)
    failures: list[PipelineFailure] = Field(default_factory=list)
