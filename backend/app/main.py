from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore, SupabaseStore
from app.adapters.openai_client import OpenAIClient
from app.pipeline.orchestrator import PipelineOrchestrator
from app.settings import settings
from app.api.routes import admin, attachments, dashboard, emails, export, health, pipeline, review

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def create_store():
    if settings.supabase_url and settings.supabase_service_role_key:
        try:
            return SupabaseStore(
                settings.runtime_dir,
                settings.supabase_url,
                settings.supabase_service_role_key,
            )
        except Exception as exc:
            logging.warning("Supabase unavailable; using local store: %s", exc)
    return LocalStore(settings.runtime_dir)


@asynccontextmanager
async def lifespan(app: FastAPI):
    store = create_store()
    loader = DatasetLoader(settings.data_dir, store.runtime_dir)
    openai = OpenAIClient(
        settings.openai_api_key,
        settings.openai_model,
        settings.openai_timeout_seconds,
        reasoning_effort=settings.openai_reasoning_effort_classify,
    )
    app.state.loader = loader
    app.state.store = store
    app.state.openai = openai
    app.state.orchestrator = PipelineOrchestrator(loader, store, openai)
    yield


app = FastAPI(title="ShipCheck API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health.router)
app.include_router(dashboard.router, prefix="/api")
app.include_router(emails.router, prefix="/api")
app.include_router(pipeline.router, prefix="/api")
app.include_router(attachments.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(review.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
