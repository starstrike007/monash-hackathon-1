from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.schemas.pipeline import (
    PipelineBootstrapStatus,
    PipelineRun,
    PipelineRunDetail,
    PipelineRunRequest,
)

router = APIRouter(tags=["pipeline"])


@router.post("/pipeline/bootstrap", response_model=PipelineBootstrapStatus)
def start_pipeline_bootstrap(request: Request) -> PipelineBootstrapStatus:
    return PipelineBootstrapStatus(**request.app.state.orchestrator.start_bootstrap())


@router.get("/pipeline/bootstrap/status", response_model=PipelineBootstrapStatus)
def pipeline_bootstrap_status(request: Request) -> PipelineBootstrapStatus:
    return PipelineBootstrapStatus(**request.app.state.orchestrator.get_bootstrap_status())


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
