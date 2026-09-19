from __future__ import annotations

import mimetypes

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

router = APIRouter(tags=["attachments"])


@router.get("/attachments/{path:path}")
def attachment(path: str, request: Request) -> FileResponse:
    try:
        target = request.app.state.loader.resolve_attachment(f"attachments/{path}")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Attachment not found") from exc
    media_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return FileResponse(target, media_type=media_type, filename=target.name)
