from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.app.services.submission_service import build_submission

router = APIRouter(tags=["export"])


@router.get("/export/submission")
def export_submission(request: Request) -> JSONResponse:
    request.app.state.orchestrator.ensure_seeded()
    email_ids = [email["email_id"] for email in request.app.state.loader.list_emails()]
    return JSONResponse(build_submission(request.app.state.store, email_ids))
