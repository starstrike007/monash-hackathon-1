from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pipeline.orchestrator import PipelineOrchestrator
from app.services.timestamps import KUALA_LUMPUR, generate_received_at

from .conftest import FIXTURE_DATA_DIR
from app.settings import settings


@pytest.fixture
def api_client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "data_dir", FIXTURE_DATA_DIR)
    monkeypatch.setattr(settings, "runtime_dir", tmp_path / "runtime")
    monkeypatch.setattr(PipelineOrchestrator, "_default_output_dir", lambda self: tmp_path / "output")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_service_role_key", "")
    with TestClient(app) as client:
        yield client


def test_timestamps_are_deterministic_and_in_business_hours() -> None:
    now = datetime(2026, 9, 21, tzinfo=timezone.utc)
    first = generate_received_at("email_001", now=now)
    second = generate_received_at("email_001", now=now)
    other = generate_received_at("email_002", now=now)

    assert first == second, "the same email_id must always produce the same timestamp"
    assert first != other

    parsed = datetime.fromisoformat(first).astimezone(KUALA_LUMPUR)
    assert 9 <= parsed.hour < 18


def test_override_away_from_comparison_clears_status(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    before = api_client.get("/api/emails/email_fixture_ok").json()
    assert before["category"] == "BL_COMPARISON"
    assert before["status"] == "OK"

    response = api_client.post(
        "/api/emails/email_fixture_ok/override",
        json={"category": "SPAM", "actor": "qa"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["category"] == "SPAM"
    assert body["result"]["status"] is None
    assert body["email_meta"]["category_machine"] == "BL_COMPARISON"
    assert body["email_meta"]["category_override"] == "SPAM"

    after = api_client.get("/api/emails/email_fixture_ok").json()
    assert after["category"] == "SPAM"
    assert after["category_machine"] == "BL_COMPARISON"


def test_override_into_comparison_with_no_attachments_opens_review_item(api_client):
    api_client.post("/api/pipeline/run", json={})
    before = api_client.get("/api/emails/email_fixture_general").json()
    assert before["category"] != "BL_COMPARISON"

    response = api_client.post(
        "/api/emails/email_fixture_general/override",
        json={"category": "BL_COMPARISON", "actor": "qa"},
    )
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["category"] == "BL_COMPARISON"
    assert result["status"] == "NEEDS_REVIEW"
    assert result["review_reason"] == "missing_attachment"

    items = api_client.get(
        "/api/review/items", params={"status": "open", "reason": "missing_attachment"}
    ).json()["items"]
    assert any(item["email_id"] == "email_fixture_general" for item in items)

    # Reverting (category: null) restores the machine category and closes the review item.
    revert = api_client.post(
        "/api/emails/email_fixture_general/override",
        json={"category": None, "actor": "qa"},
    )
    assert revert.status_code == 200
    reverted = revert.json()
    assert reverted["result"]["category"] == reverted["email_meta"]["category_machine"]
    assert reverted["email_meta"]["category_override"] is None

    items_after = api_client.get(
        "/api/review/items", params={"status": "open", "reason": "missing_attachment"}
    ).json()["items"]
    assert not any(item["email_id"] == "email_fixture_general" for item in items_after)


def test_review_resolution_recomputes_status_and_closes_item(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_placeholder"]})
    detail = api_client.get("/api/emails/email_fixture_placeholder").json()
    assert detail["status"] == "NEEDS_REVIEW"
    assert detail["review_reason"] == "missing_value"

    items = api_client.get(
        "/api/review/items", params={"status": "open", "email_id": "email_fixture_placeholder"}
    ).json()["items"]
    assert len(items) == 1
    item_id = items[0]["id"]

    resolve = api_client.post(
        f"/api/review/items/{item_id}/resolve",
        json={"action": "confirm", "field_name": "gross_weight_kg", "reviewer_id": "qa"},
    )
    assert resolve.status_code == 200
    body = resolve.json()
    assert body["review_item"]["status"] == "resolved"

    after = api_client.get("/api/emails/email_fixture_placeholder").json()
    assert after["status"] in {"OK", "MISMATCH"}
    assert after["review_reason"] is None


def test_export_submission_uses_effective_category(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    api_client.post(
        "/api/emails/email_fixture_ok/override", json={"category": "INVOICE_QUERY", "actor": "qa"}
    )

    submission = api_client.get("/api/export/submission").json()
    assert submission["email_fixture_ok"]["category"] == "INVOICE_QUERY"
