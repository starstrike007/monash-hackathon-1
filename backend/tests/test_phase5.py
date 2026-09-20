from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.adapters.document_parsers import parse_attachment
from app.adapters.local_store import LocalStore
from app.adapters.openai_client import OpenAIClient
from app.api.schemas.common import (
    CanonicalField,
    ComparisonStatus,
    Confidence,
    DocumentExtraction,
    DocumentRole,
    DocumentType,
    EmailCategory,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    FieldExtraction,
    ReviewReason,
)
from app.main import app
from app.pipeline.classify import classify_email
from app.pipeline.compare import compare_documents
from app.pipeline.decide import decide_result
from app.pipeline.extract import extract_document
from app.pipeline.orchestrator import PipelineOrchestrator
from app.settings import settings

from .conftest import FIXTURE_DATA_DIR


def load_fixture_email(email_id: str) -> dict:
    path = FIXTURE_DATA_DIR / "inbox" / f"{email_id}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def extract_fixture_documents(email: dict, fixture_loader) -> list[DocumentExtraction]:
    documents = []
    for path in email.get("attachments", []):
        parsed = parse_attachment(fixture_loader, path)
        role = {
            DocumentType.SHIPPING_INSTRUCTION: DocumentRole.SI,
            DocumentType.BILL_OF_LADING: DocumentRole.BL,
        }.get(parsed.document_type)
        documents.append(extract_document(parsed, role))
    return documents


def process_fixture_email(email_id: str, fixture_loader, tmp_path) -> object:
    email = load_fixture_email(email_id)
    orchestrator = PipelineOrchestrator(fixture_loader, LocalStore(tmp_path / email_id))
    return orchestrator.process_email(email, "fixture-run")


def make_normalized_document(
    role: DocumentRole,
    overrides: dict[CanonicalField, str] | None = None,
) -> DocumentExtraction:
    values = {
        CanonicalField.SHIPPER: "MERIDIAN PULP SENDIRIAN BERHAD",
        CanonicalField.CONSIGNEE: "HARBOUR LINE TRADING LIMITED",
        CanonicalField.NOTIFY_PARTY: "YANGTZE LOGISTICS COMPANY LIMITED",
        CanonicalField.PORT_OF_LOADING: "MYPKG",
        CanonicalField.PORT_OF_DISCHARGE: "CNSHA",
        CanonicalField.CONTAINER_COUNT: "3",
        CanonicalField.GROSS_WEIGHT_KG: "22000",
    }
    values.update(overrides or {})
    fields = [
        FieldExtraction(
            field_name=field,
            state=ExtractionState.FOUND,
            raw_value=value,
            normalized_value=value,
            source=ExtractionSource.RULE,
            confidence=Confidence.HIGH,
            evidence=FieldEvidence(
                snippet=f"{field.value}: {value}",
                source_path=f"{role.value.lower()}.txt",
            ),
        )
        for field, value in values.items()
    ]
    return DocumentExtraction(
        role=role,
        path=f"attachments/{role.value.lower()}.txt",
        document_type=(
            DocumentType.SHIPPING_INSTRUCTION
            if role == DocumentRole.SI
            else DocumentType.BILL_OF_LADING
        ),
        readable=True,
        fields=fields,
    )


def test_synthetic_ok_case_matches_all_seven_fields_with_formatting_differences(fixture_loader, tmp_path):
    result = process_fixture_email("email_fixture_ok", fixture_loader, tmp_path)

    assert result.status == ComparisonStatus.OK
    assert result.has_defect is False
    assert result.defect_fields == []
    assert len(result.comparisons) == 7
    assert all(comparison.result == "match" for comparison in result.comparisons)


def test_synthetic_mismatch_case_only_defects_container_count(fixture_loader, tmp_path):
    result = process_fixture_email("email_fixture_mismatch", fixture_loader, tmp_path)

    assert result.status == ComparisonStatus.MISMATCH
    assert result.has_defect is True
    assert [field.value for field in result.defect_fields] == ["container_count"]


def test_pipeline_run_persists_document_comparison_result(fixture_loader, tmp_path):
    email = load_fixture_email("email_fixture_mismatch")
    store = LocalStore(tmp_path / "pipeline-run")
    orchestrator = PipelineOrchestrator(fixture_loader, store)

    run = orchestrator.run([email["email_id"]], rules_only=True)
    result = store.get_result(email["email_id"])

    assert run["status"] == "complete"
    assert result is not None
    assert result["category"] == EmailCategory.BL_COMPARISON.value
    assert result["status"] == ComparisonStatus.MISMATCH.value
    assert result["defect_fields"] == [CanonicalField.CONTAINER_COUNT.value]
    assert [stage["stage_number"] for stage in store.get_stages(run["run_id"])] == [1, 2, 3, 4]


def test_comparison_without_a_bl_attachment_is_missing_attachment_review(fixture_loader, tmp_path):
    result = process_fixture_email("email_fixture_missing_bl", fixture_loader, tmp_path)

    assert result.status == ComparisonStatus.NEEDS_REVIEW
    assert result.review_reason == ReviewReason.MISSING_ATTACHMENT


def test_placeholder_value_is_reviewed_as_missing_value(fixture_loader, tmp_path):
    result = process_fixture_email("email_fixture_placeholder", fixture_loader, tmp_path)
    gross_weight = next(
        field
        for document in result.documents
        for field in document.fields
        if field.field_name == CanonicalField.GROSS_WEIGHT_KG
    )

    assert gross_weight.state == ExtractionState.PLACEHOLDER
    assert result.status == ComparisonStatus.NEEDS_REVIEW
    assert result.review_reason == ReviewReason.MISSING_VALUE
    assert result.status != ComparisonStatus.MISMATCH


def test_empty_pdf_is_unreadable(fixture_loader):
    parsed = parse_attachment(fixture_loader, "attachments/fixture_empty.pdf")

    assert parsed.readable is False
    assert parsed.document_type == DocumentType.UNREADABLE


def test_unreadable_only_attachment_routes_to_unreadable_review(fixture_loader, tmp_path):
    result = process_fixture_email("email_fixture_unreadable", fixture_loader, tmp_path)

    assert result.status == ComparisonStatus.NEEDS_REVIEW
    assert result.review_reason == ReviewReason.UNREADABLE


def test_general_email_that_mentions_bl_is_not_a_comparison(fixture_loader, tmp_path):
    email = load_fixture_email("email_fixture_general")

    assert classify_email(email) == EmailCategory.GENERAL
    result = process_fixture_email("email_fixture_general", fixture_loader, tmp_path)
    assert result.category == EmailCategory.GENERAL
    assert result.status is None


def test_compare_and_decide_use_hand_built_normalized_field_sets():
    si = make_normalized_document(DocumentRole.SI)
    bl = make_normalized_document(DocumentRole.BL)

    comparisons = compare_documents(si, bl)
    result = decide_result(
        email_id="hand-built-ok",
        run_id="fixture-run",
        category=EmailCategory.BL_COMPARISON,
        comparisons=comparisons,
        documents=[si, bl],
    )

    assert all(comparison.result == "match" for comparison in comparisons)
    assert result.status == ComparisonStatus.OK
    assert result.has_defect is False
    assert result.defect_fields == []


def test_decide_directly_reports_a_hand_built_container_mismatch():
    si = make_normalized_document(DocumentRole.SI)
    bl = make_normalized_document(
        DocumentRole.BL,
        {CanonicalField.CONTAINER_COUNT: "4"},
    )

    result = decide_result(
        email_id="hand-built-mismatch",
        run_id="fixture-run",
        category=EmailCategory.BL_COMPARISON,
        comparisons=compare_documents(si, bl),
        documents=[si, bl],
    )

    assert result.status == ComparisonStatus.MISMATCH
    assert [field.value for field in result.defect_fields] == ["container_count"]


def test_decide_directly_maps_missing_attachment_to_review():
    si = make_normalized_document(DocumentRole.SI)

    result = decide_result(
        email_id="hand-built-missing-bl",
        run_id="fixture-run",
        category=EmailCategory.BL_COMPARISON,
        comparisons=[],
        documents=[si],
        document_reason=ReviewReason.MISSING_ATTACHMENT,
    )

    assert result.status == ComparisonStatus.NEEDS_REVIEW
    assert result.review_reason == ReviewReason.MISSING_ATTACHMENT
    assert result.has_defect is None


class TimeoutResponses:
    def create(self, **kwargs):
        raise TimeoutError("synthetic provider timeout")


class TimeoutClient:
    responses = TimeoutResponses()


@pytest.mark.xfail(
    reason="stub: OpenAIClient currently swallows provider timeouts instead of recording a retryable failure",
    strict=False,
)
def test_model_timeout_is_visible_as_retryable_failure_not_mismatch(fixture_loader, tmp_path):
    email = load_fixture_email("email_fixture_general")
    client = OpenAIClient("synthetic-key", "synthetic-model")
    client.client = TimeoutClient()
    store = LocalStore(tmp_path / "timeout")
    orchestrator = PipelineOrchestrator(fixture_loader, store, client)

    run = orchestrator.run([email["email_id"]])
    failures = store.get_failures(run["run_id"])
    result = store.get_result(email["email_id"])

    assert run["status"] == "failed"
    assert failures and failures[0]["retryable"] is True
    assert result is None or result.get("status") != ComparisonStatus.MISMATCH.value


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", FIXTURE_DATA_DIR)
    monkeypatch.setattr(settings, "runtime_dir", tmp_path / "runtime")
    monkeypatch.setattr(
        PipelineOrchestrator,
        "_default_output_dir",
        lambda self: tmp_path / "output",
    )
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    with TestClient(app) as client:
        yield client


def test_health_endpoint(api_client):
    response = api_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_emails_returns_every_synthetic_email(api_client, fixture_loader):
    response = api_client.get("/api/emails")
    expected_ids = {email["email_id"] for email in fixture_loader.list_emails()}

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == len(expected_ids)
    assert {item["email_id"] for item in payload["items"]} == expected_ids


def test_submission_export_includes_every_email_and_sample_row_shape(api_client, fixture_loader):
    response = api_client.get("/api/export/submission")
    expected_ids = {email["email_id"] for email in fixture_loader.list_emails()}
    sample_path = Path(__file__).resolve().parents[2] / "data" / "sample_submission.json"
    sample = json.loads(sample_path.read_text(encoding="utf-8"))
    expected_row_keys = set(next(iter(sample.values())))

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == expected_ids
    assert all(set(row) == expected_row_keys for row in payload.values())
