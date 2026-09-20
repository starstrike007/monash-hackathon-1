from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import logging
import os
import random
import threading
import time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.schemas.common import Confidence, EmailCategory
from app.pipeline.prompts import (
    CLASSIFICATION_PROMPT,
    CLASSIFICATION_PROMPT_VERSION,
)

logger = logging.getLogger(__name__)

CLASSIFICATION_SCHEMA_NAME = "email_classification"
RETRY_DELAY_CAP_SECONDS = 20.0


class MissingAPIKeyError(RuntimeError):
    """Raised as a safe, non-secret diagnostic when no OpenAI key is configured."""


class ClassificationOutputError(ValueError):
    """Raised when a Responses API call has no usable structured classification."""


class ClassificationProposal(BaseModel):
    """The only model output accepted by the Stage 1 LLM boundary."""

    model_config = ConfigDict(extra="forbid")

    category: EmailCategory
    confidence: Confidence
    reason: str = Field(description="A concise reason using no more than 20 words.")

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        words = value.split()
        if not words:
            raise ValueError("reason must not be empty")
        if len(words) > 20:
            raise ValueError("reason must contain at most 20 words")
        return " ".join(words)


@dataclass(frozen=True)
class ClassificationCallResult:
    """A per-email provider result, including diagnostics safe for the report."""

    proposal: ClassificationProposal | None
    usage: dict[str, int] | None = None
    latency_seconds: float | None = None
    attempts: int = 0
    failure_reason_code: str | None = None
    exception_class: str | None = None
    exception_message: str | None = None


def _value(source: Any, key: str, default: Any = None) -> Any:
    if source is None:
        return default
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _as_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def response_usage(response: Any) -> dict[str, int] | None:
    """Extract Responses API token usage from SDK objects or test doubles."""

    usage = _value(response, "usage")
    if usage is None:
        return None
    output_details = _value(usage, "output_tokens_details")
    return {
        "input_tokens": _as_int(_value(usage, "input_tokens")),
        "output_tokens": _as_int(_value(usage, "output_tokens")),
        "reasoning_tokens": _as_int(_value(output_details, "reasoning_tokens")),
    }


def _status_code(error: Exception) -> int | None:
    value = getattr(error, "status_code", None)
    if value is None:
        response = getattr(error, "response", None)
        value = getattr(response, "status_code", None)
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def failure_reason_code(error: Exception) -> str:
    """Map provider failures to the stable codes used by reports and smoke tests."""

    name = type(error).__name__
    status_code = _status_code(error)
    if status_code == 429 or name in {"RateLimitError", "RateLimitException"}:
        return "llm_rate_limited"
    if (
        isinstance(error, TimeoutError)
        or name in {
            "APITimeoutError",
            "ConnectTimeout",
            "PoolTimeout",
            "ReadTimeout",
            "TimeoutException",
            "WriteTimeout",
        }
    ):
        return "llm_timeout"
    if status_code == 400 or name in {"BadRequestError", "InvalidRequestError"}:
        return "llm_bad_request"
    return "llm_error"


def _is_transient_error(error: Exception) -> bool:
    if failure_reason_code(error) in {"llm_rate_limited", "llm_timeout"}:
        return True
    if isinstance(error, (ConnectionError, OSError)):
        return True
    name = type(error).__name__
    if name in {"APIConnectionError", "InternalServerError", "ServiceUnavailableError"}:
        return True
    status_code = _status_code(error)
    return isinstance(status_code, int) and status_code >= 500


def _retry_after_seconds(error: Exception) -> float | None:
    """Read a numeric or HTTP-date Retry-After header when the SDK exposes one."""

    for holder in (error, getattr(error, "response", None)):
        headers = getattr(holder, "headers", None)
        if headers is None:
            continue
        value = None
        try:
            value = headers.get("retry-after") or headers.get("Retry-After")
        except AttributeError:
            continue
        if value is None:
            continue
        try:
            seconds = float(str(value).strip())
        except ValueError:
            try:
                retry_at = parsedate_to_datetime(str(value))
                if retry_at.tzinfo is None:
                    retry_at = retry_at.replace(tzinfo=timezone.utc)
                seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()
            except (TypeError, ValueError, OverflowError):
                continue
        return min(RETRY_DELAY_CAP_SECONDS, max(0.0, seconds))
    return None


def _backoff_seconds(base: float, attempt: int) -> float:
    exponential = min(RETRY_DELAY_CAP_SECONDS, max(0.0, base) * (2**attempt))
    if exponential <= 0:
        return 0.0
    jitter = random.uniform(0.0, exponential * 0.25)
    return min(RETRY_DELAY_CAP_SECONDS, exponential + jitter)


class OpenAIClient:
    """Optional structured-output boundary for the Stage 1 fallback."""

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout_seconds: float = 20.0,
        max_retries: int = 2,
        retry_backoff_seconds: float = 0.25,
        reasoning_effort: str | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = float(timeout_seconds)
        self.max_retries = max(0, int(max_retries))
        self.retry_backoff_seconds = max(0.0, float(retry_backoff_seconds))
        configured_effort = (
            os.getenv("OPENAI_REASONING_EFFORT_CLASSIFY", "")
            if reasoning_effort is None
            else reasoning_effort
        )
        self.reasoning_effort = configured_effort.strip() or None
        self.client = None
        self.unavailable_failure_reason_code: str | None = None
        self.unavailable_exception_class: str | None = None
        self.unavailable_exception_message: str | None = None
        self.last_call_failed = False
        self.last_failure_reason_code: str | None = None
        self.last_exception_class: str | None = None
        self.last_exception_message: str | None = None
        self.request_attempts = 0
        self.retry_count = 0
        self._metrics_lock = threading.Lock()
        if not api_key:
            error = MissingAPIKeyError("OPENAI_API_KEY is not configured")
            self.unavailable_failure_reason_code = "llm_no_key"
            self.unavailable_exception_class = type(error).__name__
            self.unavailable_exception_message = str(error)
            return
        try:
            from openai import OpenAI

            self.client = OpenAI(api_key=api_key, timeout=self.timeout_seconds, max_retries=0)
        except ImportError as exc:
            self.unavailable_failure_reason_code = "llm_error"
            self.unavailable_exception_class = type(exc).__name__
            self.unavailable_exception_message = str(exc)
            logger.warning("OpenAI fallback unavailable because the openai package is not installed")

    @property
    def available(self) -> bool:
        return self.client is not None

    @property
    def prompt_cache_key(self) -> str:
        return f"{CLASSIFICATION_PROMPT_VERSION}:{self.model}"

    def _request_classification(self, context: dict[str, Any]) -> tuple[ClassificationProposal, Any]:
        if self.client is None:
            raise MissingAPIKeyError("OPENAI_API_KEY is not configured")

        request_kwargs: dict[str, Any] = {
            "model": self.model,
            "instructions": CLASSIFICATION_PROMPT,
            "input": [{"role": "user", "content": json.dumps(context, ensure_ascii=False)}],
            "prompt_cache_key": self.prompt_cache_key,
            "timeout": self.timeout_seconds,
        }
        if self.reasoning_effort:
            request_kwargs["reasoning"] = {"effort": self.reasoning_effort}

        responses = self.client.responses
        parse = getattr(responses, "parse", None)
        if callable(parse):
            response = parse(text_format=ClassificationProposal, **request_kwargs)
            parsed = _value(response, "output_parsed")
            if parsed is None:
                raise ClassificationOutputError("Responses API returned no parsed classification")
            proposal = (
                parsed
                if isinstance(parsed, ClassificationProposal)
                else ClassificationProposal.model_validate(parsed)
            )
            return proposal, response

        # Compatibility path for SDKs that do not expose Responses.parse.
        response = responses.create(
            text={
                "format": {
                    "type": "json_schema",
                    "name": CLASSIFICATION_SCHEMA_NAME,
                    "strict": True,
                    "schema": ClassificationProposal.model_json_schema(),
                }
            },
            **request_kwargs,
        )
        output_text = _value(response, "output_text")
        if not isinstance(output_text, str):
            raise ClassificationOutputError("Responses API returned no output text")
        return ClassificationProposal.model_validate_json(output_text), response

    def _finish(self, result: ClassificationCallResult) -> ClassificationCallResult:
        self.last_call_failed = result.proposal is None
        self.last_failure_reason_code = result.failure_reason_code
        self.last_exception_class = result.exception_class
        self.last_exception_message = result.exception_message
        return result

    def propose_classification_result(self, context: dict[str, Any]) -> ClassificationCallResult:
        """Call the model with bounded retries and return per-call diagnostics."""

        started = time.perf_counter()
        if self.client is None:
            error = MissingAPIKeyError(
                self.unavailable_exception_message or "OPENAI_API_KEY is not configured"
            )
            return self._finish(
                ClassificationCallResult(
                    proposal=None,
                    latency_seconds=0.0,
                    failure_reason_code=self.unavailable_failure_reason_code or "llm_error",
                    exception_class=self.unavailable_exception_class or type(error).__name__,
                    exception_message=str(error),
                )
            )

        attempts = 0
        for attempt in range(self.max_retries + 1):
            attempts += 1
            with self._metrics_lock:
                self.request_attempts += 1
            try:
                proposal, response = self._request_classification(context)
                return self._finish(
                    ClassificationCallResult(
                        proposal=proposal,
                        usage=response_usage(response),
                        latency_seconds=time.perf_counter() - started,
                        attempts=attempts,
                    )
                )
            except Exception as exc:
                if _is_transient_error(exc) and attempt < self.max_retries:
                    with self._metrics_lock:
                        self.retry_count += 1
                    delay = _retry_after_seconds(exc)
                    if delay is None:
                        delay = _backoff_seconds(self.retry_backoff_seconds, attempt)
                    if delay:
                        time.sleep(delay)
                    continue
                return self._finish(
                    ClassificationCallResult(
                        proposal=None,
                        latency_seconds=time.perf_counter() - started,
                        attempts=attempts,
                        failure_reason_code=failure_reason_code(exc),
                        exception_class=type(exc).__name__,
                        exception_message=str(exc),
                    )
                )

        # The loop always returns, but retain a safe failure for static analyzers.
        return self._finish(
            ClassificationCallResult(
                proposal=None,
                latency_seconds=time.perf_counter() - started,
                attempts=attempts,
                failure_reason_code="llm_error",
                exception_class="RuntimeError",
                exception_message="classification attempt limit reached",
            )
        )

    def propose_classification(self, context: dict[str, Any]) -> str | None:
        """Backward-compatible category-only wrapper around the traced call."""

        result = self.propose_classification_result(context)
        return result.proposal.category.value if result.proposal is not None else None

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
            )
            data = json.loads(response.output_text)
            return data if isinstance(data, dict) else None
        except Exception as exc:
            logger.warning("OpenAI extraction fallback failed: %s", type(exc).__name__)
            return None
