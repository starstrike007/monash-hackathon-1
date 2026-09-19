from __future__ import annotations

from fastapi import APIRouter, Request

from backend.app.api.schemas.pipeline import (
    PipelineRun,
    PipelineRunDetail,
    PipelineRunRequest,
)

router = APIRouter(tags=["pipeline"])


@router.post("/pipeline/run", response_model=PipelineRun)
def run_pipeline(payload: PipelineRunRequest, request: Request) -> PipelineRun:
    run = request.app.state.orchestrator.run(
        email_ids=payload.email_ids,
        retry_failed_only=payload.retry_failed_only,
    )
    return PipelineRun(**run)


@router.get("/pipeline/runs/{run_id}", response_model=PipelineRunDetail)
def pipeline_run(run_id: str, request: Request) -> PipelineRunDetail:
    run = request.app.state.store.get_run(run_id)
    if not run:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Pipeline run not found")
    return PipelineRunDetail(
        **run,
        stages=request.app.state.store.get_stages(run_id),
        failures=request.app.state.store.get_failures(run_id),
    )
