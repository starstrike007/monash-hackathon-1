from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


class Settings:
    def __init__(self) -> None:
        self.backend_dir = Path(__file__).resolve().parents[1]
        self.root_dir = Path(__file__).resolve().parents[2]
        self.env_file_path = self.backend_dir / ".env"
        api_key_from_environment = os.environ.get("OPENAI_API_KEY")
        load_dotenv(dotenv_path=self.env_file_path, override=False)
        self.data_dir = Path(os.getenv("DATA_DIR", self.root_dir / "data")).resolve()
        self.runtime_dir = Path(os.getenv("RUNTIME_DIR", self.root_dir / ".runtime")).resolve()
        self.stage1_llm_cache_path = Path(
            os.getenv(
                "STAGE1_LLM_CACHE_PATH",
                self.runtime_dir / "stage1_llm_cache.json",
            )
        ).resolve()
        self.ignore_stage1_llm_cache = _env_bool("IGNORE_STAGE1_LLM_CACHE", False)
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        if api_key_from_environment:
            self.openai_key_source = "env"
        elif self.openai_api_key:
            self.openai_key_source = ".env"
        else:
            self.openai_key_source = None
        self.openai_model = os.getenv("OPENAI_MODEL", "gpt-5.6-luna")
        self.openai_timeout_seconds = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "20"))
        self.openai_reasoning_effort_classify = (
            os.getenv("OPENAI_REASONING_EFFORT_CLASSIFY", "").strip() or None
        )
        self.order_mode_policy = os.getenv("ORDER_MODE_POLICY", "same_party_match").strip().lower()
        if self.order_mode_policy not in {"review", "same_party_match", "always_mismatch"}:
            raise ValueError(
                "ORDER_MODE_POLICY must be review, same_party_match, or always_mismatch"
            )
        self.draft_bl_request_rule_enabled = _env_bool(
            "DRAFT_BL_REQUEST_RULE_ENABLED", True
        )
        self.supabase_url = os.getenv("SUPABASE_URL", "")
        self.supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        allowed_origins = os.getenv("ALLOWED_ORIGINS") or os.getenv("CORS_ORIGINS")
        self.allowed_origins = [
            origin.strip()
            for origin in (allowed_origins or "").split(",")
            if origin.strip()
        ]
        # Always allow localhost on any port (Vite may pick a different one
        # each run) in addition to any explicitly configured production
        # origins - CORSMiddleware allows a request that matches either, so
        # setting ALLOWED_ORIGINS for production never breaks local dev.
        self.cors_origin_regex = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
        # Keep the existing attribute name available to the app and callers.
        self.cors_origins = self.allowed_origins


settings = Settings()
