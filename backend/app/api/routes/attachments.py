from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from app.adapters.document_parsers import render_pdf_page_png
from app.adapters.document_view import build_document_view

router = APIRouter(tags=["attachments"])


def _media_type(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def _loader_path(route_path: str) -> str:
    normalized = route_path.replace("\\", "/").lstrip("/")
    if normalized.startswith(("attachments/", "uploads/")):
        return normalized
    return f"attachments/{normalized}"


@router.get("/attachments/{path:path}/view")
def attachment_view(path: str, request: Request) -> JSONResponse:
    loader = request.app.state.loader
    relative_path = _loader_path(path)
    try:
        loader.resolve_attachment(relative_path)
        view = build_document_view(loader, relative_path, path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Attachment not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"This attachment could not be viewed: {type(exc).__name__}") from exc
    return JSONResponse(view)


@router.get("/attachments/{path:path}/pages/{page_number}")
def attachment_page_image(path: str, page_number: int, request: Request) -> Response:
    loader = request.app.state.loader
    relative_path = _loader_path(path)
    try:
        target = loader.resolve_attachment(relative_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Attachment not found") from exc
    if target.suffix.lower() != ".pdf":
        raise HTTPException(status_code=415, detail="Page images are only available for PDF attachments")
    try:
        png_bytes = render_pdf_page_png(target.read_bytes(), page_number)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        # A corrupt/unsupported PDF is an expected operational condition
        # (the same files are already marked unreadable during extraction);
        # surface it as a clean error rather than a raw 500.
        raise HTTPException(status_code=422, detail=f"This page could not be rendered: {exc}") from exc
    return Response(content=png_bytes, media_type="image/png")


@router.get("/attachments/{path:path}/inline")
def attachment_inline(path: str, request: Request) -> FileResponse:
    relative_path = _loader_path(path)
    try:
        target = request.app.state.loader.resolve_attachment(relative_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Attachment not found") from exc
    return FileResponse(
        target,
        media_type=_media_type(target),
        filename=target.name,
        content_disposition_type="inline",
    )


@router.get("/attachments/{path:path}")
def attachment(path: str, request: Request) -> FileResponse:
    relative_path = _loader_path(path)
    try:
        target = request.app.state.loader.resolve_attachment(relative_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Attachment not found") from exc
    return FileResponse(
        target,
        media_type=_media_type(target),
        filename=target.name,
        content_disposition_type="attachment",
    )
