from __future__ import annotations

from fastapi import APIRouter, Request

from app.services.timestamps import rebase_timestamps

router = APIRouter(tags=["admin"])


@router.post("/admin/rebase-timestamps")
def rebase_timestamps_route(request: Request) -> dict:
    """Regenerate every email's simulated received_at relative to now, so a
    demo can be re-anchored right before a presentation without editing the
    dataset. Times are simulated because the dataset carries none."""

    request.app.state.orchestrator.ensure_seeded()
    updated = rebase_timestamps(request.app.state.store, request.app.state.loader)
    return {"updated": updated}
