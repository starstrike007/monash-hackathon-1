from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class OpenAIClient:
    """Small, optional boundary for structured classification/extraction fallbacks.

    The deterministic pipeline remains usable when no API key is configured. A
    failed or malformed model response returns None so callers can route the
    record to review instead of inventing a value.
    """

    def __init__(self, api_key: str, model: str, timeout_seconds: float = 20.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.client = None
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
        if not self.client:
            return None
        try:
            response = self.client.responses.create(
                model=self.model,
                input=[
                    {
                        "role": "system",
                        "content": "Return JSON with exactly one category: BL_COMPARISON, SI_REQUEST, INVOICE_QUERY, GENERAL, or SPAM.",
                    },
                    {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
                ],
                temperature=0,
            )
            data = json.loads(response.output_text)
            category = data.get("category")
            return category if isinstance(category, str) else None
        except Exception as exc:
            logger.warning("OpenAI classification fallback failed: %s", type(exc).__name__)
            return None

    def propose_fields(self, context: dict[str, Any]) -> dict[str, Any] | None:
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
