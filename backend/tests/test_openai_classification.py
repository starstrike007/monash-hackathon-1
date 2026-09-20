from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.adapters.openai_client import (
    ClassificationOutputError,
    ClassificationProposal,
    OpenAIClient,
)
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
