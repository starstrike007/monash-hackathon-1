from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError

from app.api.schemas.common import EmailCategory

logger = logging.getLogger(__name__)


class ClassificationProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: EmailCategory


class OpenAIClient:
    """Optional structured-output boundary for the Stage 1 fallback."""

    def __init__(self, api_key: str, model: str, timeout_seconds: float = 20.0) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.client = None
        self.last_call_failed = False
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
        """Return a Pydantic-validated category, or None on any provider failure."""

        self.last_call_failed = False
        if not self.client:
            return None
        try:
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
        except ValidationError:
            self.last_call_failed = True
            logger.warning("OpenAI classification response failed schema validation")
            return None
        except Exception as exc:
            self.last_call_failed = True
            logger.warning("OpenAI classification fallback failed: %s", type(exc).__name__)
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
