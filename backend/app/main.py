from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.adapters.dataset_loader import DatasetLoader
from backend.app.adapters.local_store import LocalStore, SupabaseStore
from backend.app.adapters.openai_client import OpenAIClient
from backend.app.pipeline.orchestrator import PipelineOrchestrator
from backend.app.settings import settings
from backend.app.api.routes import attachments, dashboard, emails, export, health, pipeline

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
    loader = DatasetLoader(settings.data_dir)
    store = create_store()
    app.state.loader = loader
    app.state.store = store
    app.state.openai = OpenAIClient(
        settings.openai_api_key,
        settings.openai_model,
        settings.openai_timeout_seconds,
    )
    app.state.orchestrator = PipelineOrchestrator(loader, store)
    yield


app = FastAPI(title="ShipCheck API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
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
