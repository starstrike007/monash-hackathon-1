from fastapi import APIRouter, Request

from backend.app.api.schemas.dashboard import DashboardSummary
from backend.app.services.dashboard_service import build_dashboard

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(request: Request) -> DashboardSummary:
    orchestrator = request.app.state.orchestrator
    orchestrator.ensure_seeded()
    emails = request.app.state.loader.list_emails()
    return build_dashboard(emails, request.app.state.store, request.app.state.loader)
