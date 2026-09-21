from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.adapters.openai_client import (
    ClassificationOutputError,
    ClassificationProposal,
    OpenAIClient,
    failure_reason_code,
)
from app.adapters.local_store import LocalStore
from app.api.schemas.common import Confidence, EmailCategory
from app.pipeline.classify import ClassificationService, classification_cache_key
from app.pipeline.orchestrator import PipelineOrchestrator
from app.pipeline.prompts import CLASSIFICATION_PROMPT, CLASSIFICATION_PROMPT_VERSION


def _parsed_response() -> SimpleNamespace:
    return SimpleNamespace(
        output_parsed=ClassificationProposal(
            category=EmailCategory.GENERAL,
            confidence=Confidence.MEDIUM,
            reason="Routine business request",
        ),
        usage=SimpleNamespace(
            input_tokens=11,
            output_tokens=7,
            output_tokens_details=SimpleNamespace(reasoning_tokens=2),
        ),
    )


class ParseResponses:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = list(responses)
        self.calls: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class MockClient:
    def __init__(self, responses: list[Any]) -> None:
        self.responses = ParseResponses(responses)


class RateLimitError(Exception):
    status_code = 429

    def __init__(self) -> None:
        super().__init__("try again later")
        self.response = SimpleNamespace(headers={"Retry-After": "1.5"})


class BadRequestError(Exception):
    status_code = 400


class RetryableProviderError(Exception):
    retryable = True


class AuthenticationError(Exception):
    status_code = 401


class ConnectionProviderError(ConnectionError):
    pass


def test_classification_schema_is_strict_and_all_fields_are_required():
    schema = ClassificationProposal.model_json_schema()

    assert schema["type"] == "object"
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"]) == {
        "category",
        "confidence",
        "reason",
    }
    proposal = ClassificationProposal.model_validate(
        {"category": "GENERAL", "confidence": "low", "reason": "one two three " * 8}
    )
    assert len(proposal.reason.split()) == 20


def test_responses_parse_uses_prompt_version_model_and_reasoning(monkeypatch):
    monkeypatch.setenv("OPENAI_REASONING_EFFORT_CLASSIFY", "low")
    client = OpenAIClient("synthetic-key", "synthetic-model", timeout_seconds=3.5)
    mock = MockClient([_parsed_response()])
    client.client = mock

    result = client.propose_classification_result({"subject": "test", "body": "", "attachments": []})

    assert result.proposal is not None
    assert result.usage == {"input_tokens": 11, "output_tokens": 7, "reasoning_tokens": 2}
    kwargs = mock.responses.calls[0]
    assert kwargs["text_format"] is ClassificationProposal
    assert kwargs["timeout"] == 3.5
    assert kwargs["reasoning"] == {"effort": "low"}
    assert kwargs["prompt_cache_key"] == f"{CLASSIFICATION_PROMPT_VERSION}:synthetic-model"
    assert kwargs["instructions"] == CLASSIFICATION_PROMPT


def test_rate_limit_retry_after_then_success(monkeypatch):
    sleeps: list[float] = []
    monkeypatch.setattr("app.adapters.openai_client.time.sleep", sleeps.append)
    client = OpenAIClient(
        "synthetic-key",
        "synthetic-model",
        max_retries=1,
        retry_backoff_seconds=0.01,
    )
    mock = MockClient([RateLimitError(), _parsed_response()])
    client.client = mock

    result = client.propose_classification_result({"subject": "test", "body": "", "attachments": []})

    assert result.proposal is not None
    assert result.attempts == 2
    assert client.retry_count == 1
    assert sleeps == [1.5]
    assert client.last_failure_reason_code is None


def test_provider_retryable_marker_triggers_retry():
    client = OpenAIClient(
        "synthetic-key",
        "synthetic-model",
        max_retries=1,
        retry_backoff_seconds=0,
    )
    mock = MockClient([RetryableProviderError("temporary provider failure"), _parsed_response()])
    client.client = mock

    result = client.propose_classification_result({"subject": "test", "body": "", "attachments": []})

    assert result.proposal is not None
    assert result.attempts == 2
    assert client.retry_count == 1


def test_empty_structured_response_retries():
    client = OpenAIClient(
        "synthetic-key",
        "synthetic-model",
        max_retries=1,
        retry_backoff_seconds=0,
    )
    mock = MockClient([ClassificationOutputError("no parsed output"), _parsed_response()])
    client.client = mock

    result = client.propose_classification_result({"subject": "test", "body": "", "attachments": []})

    assert result.proposal is not None
    assert result.attempts == 2
    assert client.retry_count == 1


def test_permanent_bad_request_does_not_retry():
    client = OpenAIClient("synthetic-key", "synthetic-model", max_retries=3)
    mock = MockClient([BadRequestError("invalid request")])
    client.client = mock

    result = client.propose_classification_result({"subject": "test", "body": "", "attachments": []})

    assert result.proposal is None
    assert result.failure_reason_code == "llm_bad_request"
    assert result.exception_class == "BadRequestError"
    assert result.attempts == 1
    assert client.retry_count == 0
    assert len(mock.responses.calls) == 1


@pytest.mark.parametrize(
    ("error", "expected"),
    [
        (ConnectionProviderError("offline"), "llm_connection"),
        (AuthenticationError("unauthorized"), "llm_authentication"),
        (RateLimitError(), "llm_rate_limited"),
        (BadRequestError("invalid"), "llm_bad_request"),
        (TimeoutError("slow"), "llm_timeout"),
    ],
)
def test_provider_failures_have_distinct_safe_reason_codes(error, expected):
    assert failure_reason_code(error) == expected


def test_missing_key_is_recorded_without_calling_provider():
    client = OpenAIClient("", "synthetic-model")

    result = client.propose_classification_result({"subject": "test", "body": "", "attachments": []})

    assert not client.available
    assert result.proposal is None
    assert result.failure_reason_code == "llm_no_key"
    assert result.exception_class == "MissingAPIKeyError"
    assert result.exception_message == "OPENAI_API_KEY is not configured"
    assert "synthetic" not in result.exception_message


def test_cache_key_changes_with_model_and_prompt_version():
    email = {"subject": "same", "body": "same", "attachments": []}

    model_a = classification_cache_key(email, model_id="model-a")
    model_b = classification_cache_key(email, model_id="model-b")
    version_b = classification_cache_key(email, model_id="model-a", prompt_version="classify_v2")

    assert model_a != model_b
    assert model_a != version_b


def test_report_row_records_classification_trace_and_failure_code():
    proposal = ClassificationProposal(
        category=EmailCategory.GENERAL,
        confidence=Confidence.LOW,
        reason="The main request is unclear",
    )

    class TracedClassifier:
        available = True
        model = "synthetic-model"

        def propose_classification_result(self, context: dict[str, Any]) -> Any:
            return SimpleNamespace(
                proposal=proposal,
                usage={"input_tokens": 3, "output_tokens": 4, "reasoning_tokens": 1},
                latency_seconds=0.125,
            )

    email = {"email_id": "email-test", "subject": "Question", "body": "Please help."}
    service = ClassificationService(TracedClassifier())
    decision = service.classify(email)
    row = PipelineOrchestrator._classification_report_row(email, decision)

    assert row["confidence"] == "low"
    assert row["reason"] == "The main request is unclear"
    assert row["usage"] == {"input_tokens": 3, "output_tokens": 4, "reasoning_tokens": 1}
    assert row["latency_seconds"] == 0.125
    assert row["failure_reason_code"] is None
    assert service.metrics["llm_usage_totals"] == {
        "input_tokens": 3,
        "output_tokens": 4,
        "reasoning_tokens": 1,
    }


def test_report_row_records_safe_failure_diagnostics():
    class TracedFailure:
        available = True
        model = "synthetic-model"

        def propose_classification_result(self, context: dict[str, Any]) -> Any:
            return SimpleNamespace(
                proposal=None,
                failure_reason_code="llm_error",
                attempts=3,
                exception_class="APIConnectionError",
                exception_message="OpenAI API connection failed",
            )

    email = {"email_id": "email-failure", "subject": "Question", "body": "secret body"}
    service = ClassificationService(TracedFailure())
    decision = service.classify(email)
    row = PipelineOrchestrator._classification_report_row(email, decision)

    assert row["failure_reason_code"] == "llm_error"
    assert row["attempts"] == 3
    assert row["exception_class"] == "APIConnectionError"
    assert row["exception_message"] == "OpenAI API connection failed"
    assert "secret body" not in row["exception_message"]


class _AlwaysUnavailable:
    available = True
    model = "synthetic-model"

    def __init__(self, reason_codes: list[str]) -> None:
        self.reason_codes = list(reason_codes)
        self.calls = 0

    def propose_classification_result(self, context: dict[str, Any]) -> Any:
        self.calls += 1
        reason = self.reason_codes[min(self.calls - 1, len(self.reason_codes) - 1)]
        return SimpleNamespace(
            proposal=None,
            failure_reason_code=reason,
            attempts=1,
            exception_class="SyntheticProviderError",
            exception_message="synthetic provider failure",
        )


def test_connection_auth_circuit_stops_remaining_calls_with_llm_unavailable():
    provider = _AlwaysUnavailable(
        ["llm_connection", "llm_authentication", "llm_connection"]
    )
    service = ClassificationService(provider, consecutive_failure_threshold=3)
    emails = [
        {
            "email_id": f"synthetic-{index}",
            "subject": f"Unresolved question {index}",
            "body": "Could you help with this booking?",
            "attachments": [],
        }
        for index in range(7)
    ]

    decisions = service.classify_many(emails, max_workers=1)

    assert provider.calls == 3
    assert [decision.failure_reason_code for decision in decisions[:3]] == [
        "llm_connection",
        "llm_authentication",
        "llm_connection",
    ]
    assert all(decision.decided_by == "fallback_default" for decision in decisions)
    assert all(decision.reason == "llm_unavailable" for decision in decisions[3:])
    assert all(
        decision.failure_reason_code == "llm_unavailable" for decision in decisions[3:]
    )
    assert service.metrics["provider_halted"] is True
    assert service.metrics["provider_halt_count"] == 4


class _SyntheticLoader:
    def __init__(self, emails: list[dict[str, Any]]) -> None:
        self.emails = emails
        self.data_dir = None

    def list_emails(self) -> list[dict[str, Any]]:
        return list(self.emails)


def test_run_is_degraded_when_llm_failure_share_exceeds_threshold(tmp_path):
    emails = [
        {
            "email_id": f"synthetic-{index}",
            "subject": f"Unresolved question {index}",
            "body": "Could you help with this booking?",
            "attachments": [],
        }
        for index in range(20)
    ]
    orchestrator = PipelineOrchestrator(
        _SyntheticLoader(emails),
        LocalStore(tmp_path / "runtime"),
        _AlwaysUnavailable(["llm_connection"]),
        max_workers=1,
        output_dir=tmp_path / "output",
        llm_consecutive_failure_threshold=2,
        llm_degraded_failure_share=0.10,
    )

    run = orchestrator.run()

    assert run["status"] == "degraded"
    assert orchestrator.last_classification_metrics["failure_share"] == 1.0
    assert run["error_summary"]["llm_failed_items"] == 20
