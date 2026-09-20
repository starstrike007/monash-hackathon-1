from __future__ import annotations

from typing import Any

from app.adapters.openai_client import OpenAIClient
from app.api.schemas.common import EmailCategory
from app.pipeline.classify import (
    ClassificationService,
    classify_email,
    classify_email_with_trace,
    strip_noise,
)


class StubClassifier:
    available = True

    def __init__(self, category: str = "GENERAL", error: Exception | None = None) -> None:
        self.category = category
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def propose_classification(self, context: dict[str, Any]) -> str:
        self.calls.append(context)
        if self.error:
            raise self.error
        return self.category


def test_rule_pass_covers_all_five_categories_and_does_not_overread_bl():
    examples = {
        EmailCategory.BL_COMPARISON: {
            "subject": "Please confirm documents",
            "body": "Attached are the SI and draft BL. Please compare them and confirm.",
            "attachments": ["attachments/shipping_SI.txt", "attachments/draft_BL.txt"],
        },
        EmailCategory.SI_REQUEST: {
            "subject": "Request shipping instruction",
            "body": "Please send the shipping instruction for this booking.",
            "attachments": [],
        },
        EmailCategory.INVOICE_QUERY: {
            "subject": "Invoice query",
            "body": "Please clarify the invoice charge and provide the breakdown.",
            "attachments": [],
        },
        EmailCategory.GENERAL: {
            "subject": "Draft BL timing",
            "body": "Please send the draft BL when ready. No comparison is needed.",
            "attachments": [],
        },
        EmailCategory.SPAM: {
            "subject": "You won a gift card",
            "body": "Click here to claim your prize.",
            "attachments": [],
        },
    }

    for expected, email in examples.items():
        assert classify_email(email) == expected


def test_noise_stripping_removes_disclaimer_signature_and_quoted_reply():
    body = """CONFIDENTIALITY NOTICE
This message may contain privileged information.

Please compare the SI against the draft BL and confirm.

Best regards,
Documentation Team
Company footer

This email and any attachments are confidential.
From: prior@example.test
Sent: Monday
> Please compare the old documents.
"""

    cleaned = strip_noise(body)

    assert "Please compare the SI against the draft BL and confirm." in cleaned
    assert "CONFIDENTIALITY NOTICE" not in cleaned
    assert "Documentation Team" not in cleaned
    assert "prior@example.test" not in cleaned
    assert "old documents" not in cleaned


def test_llm_is_called_only_for_unresolved_email_and_validated_category_is_used():
    llm = StubClassifier(category="SI_REQUEST")
    email = {
        "subject": "Booking question",
        "body": "Could you help with the paperwork for this booking?",
        "attachments": [],
    }

    decision = classify_email_with_trace(email, llm)

    assert decision.category == EmailCategory.SI_REQUEST
    assert decision.decided_by == "llm"
    assert decision.low_confidence is False
    assert decision.model_failure is False
    assert len(llm.calls) == 1


def test_model_failure_uses_safe_general_fallback_and_is_flagged():
    llm = StubClassifier(error=TimeoutError("synthetic timeout"))
    email = {
        "subject": "Booking question",
        "body": "Could you help with the paperwork for this booking?",
        "attachments": [],
    }

    decision = classify_email_with_trace(email, llm)

    assert decision.category == EmailCategory.GENERAL
    assert decision.decided_by == "fallback_default"
    assert decision.low_confidence is True
    assert decision.model_failure is True


def test_rules_only_never_calls_the_llm_for_unresolved_email():
    llm = StubClassifier(category="SPAM")
    email = {
        "subject": "Booking question",
        "body": "Could you help with the paperwork for this booking?",
        "attachments": [],
    }

    decision = classify_email_with_trace(email, llm, rules_only=True)

    assert decision.category == EmailCategory.GENERAL
    assert decision.decided_by == "fallback_default"
    assert decision.reason == "rules_only"
    assert llm.calls == []


def test_identical_unresolved_emails_share_one_llm_call():
    llm = StubClassifier(category="GENERAL")
    service = ClassificationService(llm)
    emails = [
        {
            "email_id": "different-1",
            "subject": "Booking question",
            "body": "Could you help with the paperwork for this booking?",
            "attachments": [],
        },
        {
            "email_id": "different-2",
            "subject": "Booking question",
            "body": "Could you help with the paperwork for this booking?",
            "attachments": [],
        },
    ]

    decisions = service.classify_many(emails, max_workers=2)

    assert [decision.category for decision in decisions] == [EmailCategory.GENERAL] * 2
    assert len(llm.calls) == 1
    assert service.metrics["llm_calls"] == 1
    assert service.metrics["cache_hits"] == 1



class _Response:
    output_text = '{"category":"SPAM","confidence":"high","reason":"Promotional message"}'


class _Responses:
    def __init__(self) -> None:
        self.kwargs: dict[str, Any] | None = None

    def create(self, **kwargs: Any) -> _Response:
        self.kwargs = kwargs
        return _Response()


class _OpenAIStub:
    def __init__(self) -> None:
        self.responses = _Responses()


class _RetryingResponses:
    def __init__(self) -> None:
        self.calls = 0

    def create(self, **kwargs: Any) -> _Response:
        self.calls += 1
        if self.calls < 3:
            raise TimeoutError("synthetic transient timeout")
        return _Response()


class _RetryingOpenAIStub:
    def __init__(self) -> None:
        self.responses = _RetryingResponses()


def test_openai_classification_requests_strict_structured_output():
    client = OpenAIClient("synthetic-key", "synthetic-model")
    stub = _OpenAIStub()
    client.client = stub

    assert client.propose_classification({"subject": "offer", "body": "", "attachments": []}) == "SPAM"
    assert stub.responses.kwargs is not None
    assert stub.responses.kwargs["text"]["format"]["type"] == "json_schema"
    assert stub.responses.kwargs["text"]["format"]["strict"] is True
    assert stub.responses.kwargs["timeout"] == 20.0


def test_openai_retries_transient_failures_with_a_bound():
    client = OpenAIClient(
        "synthetic-key",
        "synthetic-model",
        max_retries=2,
        retry_backoff_seconds=0,
    )
    stub = _RetryingOpenAIStub()
    client.client = stub

    assert client.propose_classification({"subject": "offer", "body": "", "attachments": []}) == "SPAM"
    assert stub.responses.calls == 3
    assert client.retry_count == 2
