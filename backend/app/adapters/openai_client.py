from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.api.schemas.common import EmailCategory

logger = logging.getLogger(__name__)


class ClassificationProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: EmailCategory


def _is_transient_error(error: Exception) -> bool:
    if isinstance(error, (TimeoutError, ConnectionError, OSError)):
        return True
    name = type(error).__name__
    if name in {"APITimeoutError", "APIConnectionError", "RateLimitError", "InternalServerError"}:
        return True
    status_code = getattr(error, "status_code", None)
    return status_code == 429 or isinstance(status_code, int) and status_code >= 500


class OpenAIClient:
    """Optional structured-output boundary for the Stage 1 fallback."""

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
        retry_backoff_seconds: float = 0.25,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.max_retries = max(0, int(max_retries))
        self.retry_backoff_seconds = max(0.0, float(retry_backoff_seconds))
        self.client = None
        self.last_call_failed = False
        self.request_attempts = 0
        self.retry_count = 0
        self._metrics_lock = threading.Lock()
        if api_key:
            try:
                from openai import OpenAI

                self.client = OpenAI(api_key=api_key, timeout=timeout_seconds, max_retries=0)
            except ImportError:
                logger.warning("OpenAI fallback unavailable because the openai package is not installed")

    @property
    def available(self) -> bool:
        return self.client is not None

    def propose_classification(self, context: dict[str, Any]) -> str | None:
        """Return a Pydantic-validated category after bounded transient retries."""

        self.last_call_failed = False
        if not self.client:
            return None

        for attempt in range(self.max_retries + 1):
            try:
                with self._metrics_lock:
                    self.request_attempts += 1
                response = self.client.responses.create(
                    model=self.model,
                    input=[
                        {
                            "role": "system",
                            "content": "Classify the email into exactly one allowed category. Use only the supplied email and attachment metadata.",
                        },
                        {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
                    ],
                    text={
                        "format": {
                            "type": "json_schema",
                            "name": "email_classification",
                            "strict": True,
                            "schema": ClassificationProposal.model_json_schema(),
                        }
                    },
                )
                proposal = ClassificationProposal.model_validate_json(response.output_text)
                return proposal.category.value
            except Exception as exc:
                if _is_transient_error(exc) and attempt < self.max_retries:
                    with self._metrics_lock:
                        self.retry_count += 1
                    delay = min(self.retry_backoff_seconds * (2**attempt), 2.0)
                    if delay:
                        time.sleep(delay)
                    continue
                self.last_call_failed = True
                logger.warning("OpenAI classification fallback failed: %s", type(exc).__name__)
                return None

        return None

    def propose_fields(self, context: dict[str, Any]) -> dict[str, Any] | None:
        """Retain the pre-Phase-6 adapter hook; Stage 2 does not call it yet."""

        if not self.client:
            return None
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": "Return JSON for the requested shipping fields. Use null for anything not directly supported by the source evidence. Never guess.",
                    },
                    {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
                ],
                temperature=0,
            )
            data = json.loads(response.output_text)
            return data if isinstance(data, dict) else None
        except Exception as exc:
            logger.warning("OpenAI extraction fallback failed: %s", type(exc).__name__)
            return None
