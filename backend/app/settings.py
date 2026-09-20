from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.backend_dir = Path(__file__).resolve().parents[1]
        self.root_dir = Path(__file__).resolve().parents[2]
        self.env_file_path = self.backend_dir / ".env"
        api_key_from_environment = os.environ.get("OPENAI_API_KEY")
        load_dotenv(dotenv_path=self.env_file_path, override=False)
        self.data_dir = Path(os.getenv("DATA_DIR", self.root_dir / "data")).resolve()
        self.runtime_dir = Path(os.getenv("RUNTIME_DIR", self.root_dir / ".runtime")).resolve()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        if api_key_from_environment:
            self.openai_key_source = "env"
        elif self.openai_api_key:
            self.openai_key_source = ".env"
        else:
            self.openai_key_source = None
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
        self.openai_timeout_seconds = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "20"))
        self.stage2_llm_fallback = _env_bool("STAGE2_LLM_FALLBACK", default=False)
        self.openai_reasoning_effort_classify = (
            os.getenv("OPENAI_REASONING_EFFORT_CLASSIFY", "").strip() or None
        )
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
