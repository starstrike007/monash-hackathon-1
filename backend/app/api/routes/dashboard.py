from fastapi import APIRouter, Request

from app.api.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import build_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(request: Request) -> DashboardSummary:
    orchestrator = request.app.state.orchestrator
    emails = request.app.state.loader.list_emails()
    # This is intentionally a read-only endpoint. Starting a 520-email
    # pipeline run from a GET request makes a cold dashboard wait for the
    # entire classifier/extractor pipeline. The dashboard starts bootstrap
    # explicitly and can render the saved partial results while it runs.
    return build_dashboard(
        emails,
        request.app.state.store,
        request.app.state.loader,
        processing=orchestrator.get_bootstrap_status(),
    )
