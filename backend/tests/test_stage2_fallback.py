from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from app.adapters.document_parsers import ParsedDocument
from app.adapters.local_store import LocalStore
from app.adapters.openai_client import ExtractionProposal, OpenAIClient
from app.api.schemas.common import (
    CanonicalField,
    ComparisonStatus,
    DocumentRole,
    DocumentType,
    EmailCategory,
    ExtractionSource,
    ExtractionState,
)
from app.pipeline.orchestrator import PipelineOrchestrator
from app.pipeline.prompts import EXTRACTION_PROMPT, EXTRACTION_PROMPT_VERSION


class _ExtractionResponses:
    def __init__(self, response: Any) -> None:
        self.response = response
        self.calls: list[dict[str, Any]] = []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self.response


class _ExtractionProvider:
    def __init__(self, response: Any) -> None:
        self.responses = _ExtractionResponses(response)


class _StubFieldClient:
    available = True
    model = "synthetic-model"

    def __init__(self, proposal: dict[str, Any], usage: dict[str, int] | None = None) -> None:
        self.proposal = proposal
        self.usage = usage or {"input_tokens": 11, "output_tokens": 7, "reasoning_tokens": 2}
        self.calls: list[dict[str, Any]] = []
        self.last_extraction_usage: dict[str, int] | None = None

    def propose_fields(self, context: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(context)
        self.last_extraction_usage = self.usage
        return self.proposal


def _parsed_document() -> ParsedDocument:
    return ParsedDocument(
        path="attachments/si.txt",
        text="SHIPPING INSTRUCTION\nShipper: Meridian Pulp\nCustomer reference: Harbour Line",
        document_type=DocumentType.SHIPPING_INSTRUCTION,
    )


def test_stage2_fallback_is_off_by_default(fixture_loader, tmp_path):
    client = _StubFieldClient({"consignee": "Harbour Line"})
    orchestrator = PipelineOrchestrator(fixture_loader, LocalStore(tmp_path / "off"), client)

    document = orchestrator.extract_document(_parsed_document(), DocumentRole.SI)
    consignee = next(field for field in document.fields if field.field_name == CanonicalField.CONSIGNEE)

    assert client.calls == []
    assert consignee.state == ExtractionState.MISSING
    assert orchestrator.last_stage2_metrics["stage2_llm_calls"] == 0


def test_stage2_fallback_accepts_only_source_supported_values_and_records_usage(fixture_loader, tmp_path):
    client = _StubFieldClient({"consignee": "Harbour Line", "notify_party": "Invented Party"})
    orchestrator = PipelineOrchestrator(
        fixture_loader,
        LocalStore(tmp_path / "on"),
        client,
        stage2_llm_fallback=True,
    )

    document = orchestrator.extract_document(_parsed_document(), DocumentRole.SI)
    consignee = next(field for field in document.fields if field.field_name == CanonicalField.CONSIGNEE)
    notify = next(field for field in document.fields if field.field_name == CanonicalField.NOTIFY_PARTY)

    assert len(client.calls) == 1
    assert consignee.state == ExtractionState.FOUND
    assert consignee.source == ExtractionSource.LLM
    assert consignee.normalized_value == "HARBOUR LINE"
    assert consignee.evidence is not None
    assert "Harbour Line" in consignee.evidence.snippet
    assert notify.state == ExtractionState.MISSING
    assert document.llm_usage == {"input_tokens": 11, "output_tokens": 7, "reasoning_tokens": 2}
    assert orchestrator.last_stage2_metrics["stage2_llm_calls"] == 1
    assert orchestrator.last_stage2_metrics["stage2_llm_input_tokens"] == 11


def test_stage2_cannot_turn_unproven_values_into_ok_or_mismatch(tmp_path):
    data_dir = tmp_path / "data"
    attachments = data_dir / "attachments"
    attachments.mkdir(parents=True)
    (attachments / "si.txt").write_text(
        "SHIPPING INSTRUCTION\nShipper: Meridian Pulp\n",
        encoding="utf-8",
    )
    (attachments / "bl.txt").write_text(
        "BILL OF LADING\nShipper: Meridian Pulp\n",
        encoding="utf-8",
    )
    from app.adapters.dataset_loader import DatasetLoader

    loader = DatasetLoader(data_dir)
    client = _StubFieldClient(
        {
            "consignee": "Invented Consignee",
            "notify_party": "Invented Notify",
            "port_of_loading": "Invented Port",
            "port_of_discharge": "Invented Port",
            "container_count": "99",
            "gross_weight_kg": "99999 KG",
        }
    )
    orchestrator = PipelineOrchestrator(
        loader,
        LocalStore(tmp_path / "review"),
        client,
        stage2_llm_fallback=True,
    )

    result = orchestrator.process_email(
        {
            "email_id": "synthetic-review",
            "subject": "Compare SI and BL",
            "body": "Please compare the two documents.",
            "attachments": ["attachments/si.txt", "attachments/bl.txt"],
        },
        "run",
        category=EmailCategory.BL_COMPARISON,
    )

    assert result.status == ComparisonStatus.NEEDS_REVIEW
    assert result.status != ComparisonStatus.OK
    assert result.status != ComparisonStatus.MISMATCH
    assert result.has_defect is None
    assert result.defect_fields == []


def test_openai_stage2_output_uses_versioned_strict_schema_and_records_tokens():
    response = SimpleNamespace(
        output_parsed=ExtractionProposal(
            shipper="Meridian Pulp",
            consignee=None,
            notify_party=None,
            port_of_loading=None,
            port_of_discharge=None,
            container_count=None,
            gross_weight_kg=None,
        ),
        usage=SimpleNamespace(
            input_tokens=13,
            output_tokens=9,
            output_tokens_details=SimpleNamespace(reasoning_tokens=1),
        ),
    )
    client = OpenAIClient("synthetic-key", "synthetic-model", timeout_seconds=4)
    provider = _ExtractionProvider(response)
    client.client = provider

    result = client.propose_fields(
        {"fields": ["shipper"], "source_text": "Shipper: Meridian Pulp"}
    )

    assert result == {
        "shipper": "Meridian Pulp",
        "consignee": None,
        "notify_party": None,
        "port_of_loading": None,
        "port_of_discharge": None,
        "container_count": None,
        "gross_weight_kg": None,
    }
    assert client.last_extraction_usage == {
        "input_tokens": 13,
        "output_tokens": 9,
        "reasoning_tokens": 1,
    }
    kwargs = provider.responses.calls[0]
    assert kwargs["text_format"] is ExtractionProposal
    assert kwargs["instructions"] == EXTRACTION_PROMPT
    assert kwargs["prompt_cache_key"] == f"{EXTRACTION_PROMPT_VERSION}:synthetic-model"
    assert kwargs["timeout"] == 4.0
