from __future__ import annotations

import os
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.root_dir = Path(__file__).resolve().parents[2]
        self.data_dir = Path(os.getenv("DATA_DIR", self.root_dir / "data")).resolve()
        self.runtime_dir = Path(os.getenv("RUNTIME_DIR", self.root_dir / ".runtime")).resolve()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
        self.openai_timeout_seconds = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "20"))
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        allowed_origins = os.getenv("ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS")
        self.allowed_origins = [
            origin.strip()
            for origin in (allowed_origins or "").split(",")
            if origin.strip()
        ]
        # During local development Vite may select any free port. Production
        # deployments must set ALLOWED_ORIGINS or CORS_ORIGINS explicitly.
        self.cors_origin_regex = (
            None
            if self.allowed_origins
            else r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
        )
        # Keep the existing attribute name available to the app and callers.
        self.cors_origins = self.allowed_origins


settings = Settings()
