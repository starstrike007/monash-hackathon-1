from __future__ import annotations

import base64
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore
from app.main import app
from app.pipeline.orchestrator import PipelineOrchestrator
from app.services.timestamps import KUALA_LUMPUR, TIMESTAMP_ANCHOR_KEY, ensure_received_timestamps, generate_received_at

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


def test_timestamps_follow_the_requested_id_order_and_bucket_sizes() -> None:
    now = datetime(2026, 9, 21, 4, tzinfo=timezone.utc)
    anchor_date = now.astimezone(KUALA_LUMPUR).date()
    timestamps = [
        datetime.fromisoformat(generate_received_at(f"email_{number:03d}", now=now)).astimezone(
            KUALA_LUMPUR
        )
        for number in range(1, 521)
    ]
    offsets = [(anchor_date - timestamp.date()).days for timestamp in timestamps]

    assert offsets[:10] == [0, 1, 1, 2, 3, 4, 7, 8, 9, 10]
    assert all(30 <= offset <= 45 for offset in offsets[10:])
    assert timestamps == sorted(timestamps, reverse=True)
    assert all(9 <= timestamp.hour < 18 for timestamp in timestamps)


def test_timestamps_rebase_automatically_when_the_calendar_day_changes(tmp_path) -> None:
    loader = DatasetLoader(FIXTURE_DATA_DIR)
    store = LocalStore(tmp_path / "runtime")
    first_day = datetime(2026, 9, 21, 4, tzinfo=timezone.utc)
    next_day = first_day + timedelta(days=1)

    assert ensure_received_timestamps(store, loader, now=first_day) == len(loader.list_emails())
    first_timestamp = store.get_email_meta("email_fixture_general")["received_at"]
    assert store.get_email_meta("email_fixture_general")[TIMESTAMP_ANCHOR_KEY] == "2026-09-21"

    assert ensure_received_timestamps(store, loader, now=first_day) == 0
    assert ensure_received_timestamps(store, loader, now=next_day) == len(loader.list_emails())
    assert store.get_email_meta("email_fixture_general")["received_at"] != first_timestamp
    assert store.get_email_meta("email_fixture_general")[TIMESTAMP_ANCHOR_KEY] == "2026-09-22"


def test_dashboard_bootstrap_reports_real_progress(api_client):
    response = api_client.post("/api/pipeline/bootstrap")
    assert response.status_code == 200
    status = response.json()
    assert status["status"] in {"queued", "running", "ready", "complete"}

    deadline = time.monotonic() + 10
    while status["status"] in {"queued", "running"} and time.monotonic() < deadline:
        time.sleep(0.05)
        status = api_client.get("/api/pipeline/bootstrap/status").json()

    assert status["status"] in {"ready", "complete"}
    assert status["percentage"] == 100
    assert status["processed_count"] == status["total_emails"]


def test_dashboard_summary_is_read_only_before_bootstrap(api_client):
    response = api_client.get("/api/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["processing"]["status"] == "idle"
    assert body["total_emails"] == len(list((FIXTURE_DATA_DIR / "inbox").glob("email_*.json")))
    assert app.state.store.latest_run() is None


def test_review_count_does_not_start_pipeline(api_client):
    response = api_client.get("/api/review/count")

    assert response.status_code == 200
    assert response.json() == {"count": 0}
    assert app.state.store.latest_run() is None


def test_read_tabs_start_bootstrap_without_blocking_on_pipeline(api_client, monkeypatch):
    calls = []

    def start_bootstrap():
        calls.append(True)
        return {
            "status": "queued",
            "run_id": None,
            "total_emails": 2,
            "processed_count": 0,
            "percentage": 0,
            "stage": "Queued",
            "message": "Starting the dashboard pipeline.",
        }

    def unexpected_sync_seed():
        pytest.fail("a read tab must not synchronously run the full pipeline")

    monkeypatch.setattr(app.state.orchestrator, "start_bootstrap_for_read", start_bootstrap)
    monkeypatch.setattr(app.state.orchestrator, "ensure_seeded", unexpected_sync_seed)

    emails = api_client.get("/api/emails?page=1&page_size=1")
    reviews = api_client.get("/api/review/items?status=open")

    assert emails.status_code == 200
    assert reviews.status_code == 200
    assert len(calls) == 2
    assert app.state.store.latest_run() is None


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
    assert any(
        entry["action"] == "category_override"
        and entry.get("after", {}).get("category") == "SPAM"
        for entry in app.state.store.list_audit_log("email_fixture_ok")
    )


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


def test_review_issue_can_be_resolved_and_reopened(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_placeholder"]})
    item = api_client.get(
        "/api/review/items", params={"status": "open", "email_id": "email_fixture_placeholder"}
    ).json()["items"][0]

    resolve = api_client.post(
        f"/api/review/items/{item['id']}/resolve",
        json={"action": "resolve", "reviewer_id": "qa"},
    )

    assert resolve.status_code == 200
    assert resolve.json()["review_item"]["status"] == "resolved"
    assert api_client.get(
        "/api/review/items", params={"status": "open", "email_id": "email_fixture_placeholder"}
    ).json()["items"] == []
    assert len(
        api_client.get(
            "/api/review/items", params={"status": "resolved", "email_id": "email_fixture_placeholder"}
        ).json()["items"]
    ) == 1

    reopened = api_client.post(
        f"/api/review/items/{item['id']}/resolve",
        json={"action": "reopen", "reviewer_id": "qa"},
    )

    assert reopened.status_code == 200
    assert reopened.json()["review_item"]["status"] == "open"
    assert reopened.json()["review_item"]["resolved_at"] is None
    assert any(
        entry["action"] == "review_reopened"
        for entry in app.state.store.list_audit_log("email_fixture_placeholder")
    )


def test_comparison_result_override_recomputes_and_audits(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    before = api_client.get("/api/emails/email_fixture_ok").json()
    assert before["status"] == "OK"
    version = before["result"]["version"]

    response = api_client.post(
        "/api/emails/email_fixture_ok/comparison-override",
        json={
            "field_name": "shipper",
            "result": "mismatch",
            "reviewer_id": "qa",
            "expected_version": version,
        },
    )

    assert response.status_code == 200
    after = api_client.get("/api/emails/email_fixture_ok").json()
    assert after["status"] == "MISMATCH"
    assert after["result"]["has_defect"] is True
    assert "shipper" in after["defect_fields"]
    assert after["result"]["result_overrides"]["shipper"] == "mismatch"
    assert any(
        entry["action"] == "comparison_result_override"
        and entry.get("after", {}).get("result") == "mismatch"
        for entry in app.state.store.list_audit_log("email_fixture_ok")
    )


def test_existing_results_backfill_missing_review_items(api_client):
    api_client.post("/api/pipeline/run", json={})
    store = app.state.store
    expected_email_ids = {
        result["email_id"]
        for result in store.list_latest_results()
        if result.get("status") == "NEEDS_REVIEW" and result.get("review_reason")
    }

    # Simulate a local runtime created before review items were persisted.
    store.state["review_items"] = {}
    store.persist()

    response = api_client.get("/api/review/items", params={"status": "open"})

    assert response.status_code == 200
    assert {item["email_id"] for item in response.json()["items"]} == expected_email_ids


def test_export_submission_uses_effective_category(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    api_client.post(
        "/api/emails/email_fixture_ok/override", json={"category": "INVOICE_QUERY", "actor": "qa"}
    )

    submission = api_client.get("/api/export/submission").json()
    assert submission["email_fixture_ok"]["category"] == "INVOICE_QUERY"


def test_dashboard_uses_effective_category_after_override(api_client):
    api_client.post("/api/pipeline/run", json={})
    before = api_client.get("/api/dashboard/summary").json()

    api_client.post(
        "/api/emails/email_fixture_mismatch/override",
        json={"category": "GENERAL", "actor": "qa"},
    )
    after = api_client.get("/api/dashboard/summary").json()

    assert after["comparison_requests"] == before["comparison_requests"] - 1
    assert after["categories"]["GENERAL"] == before["categories"].get("GENERAL", 0) + 1


def test_missing_attachment_upload_reruns_and_writes_audit(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_missing_bl"]})
    item = api_client.get(
        "/api/review/items", params={"status": "open", "email_id": "email_fixture_missing_bl"}
    ).json()["items"][0]
    replacement = (FIXTURE_DATA_DIR / "attachments" / "fixture_ok_bl.txt").read_bytes()

    response = api_client.post(
        f"/api/review/items/{item['id']}/resolve",
        json={
            "action": "upload_missing",
            "role": "BL",
            "filename": "replacement-bl.txt",
            "content_base64": base64.b64encode(replacement).decode("ascii"),
            "reviewer_id": "qa",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["result"]["status"] == "OK"
    assert body["review_item"]["status"] == "resolved"
    assert any(document["role"] == "BL" for document in body["result"]["documents"])

    audit = api_client.get("/api/emails/email_fixture_missing_bl").json()
    assert audit["attachments"][-1]["filename"].endswith("replacement-bl.txt")
    uploaded_path = audit["attachments"][-1]["path"]
    assert api_client.get(f"/api/attachments/{uploaded_path}/view").status_code == 200
    assert api_client.get(f"/api/attachments/{uploaded_path}").status_code == 200
    assert any(
        entry["action"] == "review_upload" and entry.get("evidence", {}).get("path") == uploaded_path
        for entry in app.state.store.list_audit_log("email_fixture_missing_bl")
    )


def test_confirm_absent_is_a_human_mismatch_and_audited(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_placeholder"]})
    item = api_client.get(
        "/api/review/items", params={"status": "open", "email_id": "email_fixture_placeholder"}
    ).json()["items"][0]

    response = api_client.post(
        f"/api/review/items/{item['id']}/resolve",
        json={
            "action": "confirm_absent",
            "field_name": "gross_weight_kg",
            "reviewer_id": "qa",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["result"]["status"] == "MISMATCH"
    assert body["result"]["has_defect"] is True
    field = next(
        field
        for document in body["result"]["documents"]
        if document["role"] == "BL"
        for field in document["fields"]
        if field["field_name"] == "gross_weight_kg"
    )
    assert field["source"] == "human"
    assert body["review_item"]["status"] == "resolved"
    assert any(
        entry["action"] == "review_resolved"
        and entry.get("evidence", {}).get("after", {}).get("quoted_text") == "Confirmed absent by reviewer"
        for entry in app.state.store.list_audit_log("email_fixture_placeholder")
    )


def test_unreadable_attachment_view_is_a_clean_response(api_client):
    response = api_client.get("/api/attachments/fixture_empty.pdf/view")
    assert response.status_code in {200, 415, 422}
    assert response.status_code != 500


def test_processing_failure_stays_retryable_for_one_email(api_client, monkeypatch):
    orchestrator = app.state.orchestrator
    with monkeypatch.context() as patch:
        patch.setattr(
            orchestrator,
            "process_email",
            lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("synthetic failure")),
        )
        failed = api_client.post(
            "/api/pipeline/run", json={"email_ids": ["email_fixture_general"]}
        )
        assert failed.status_code == 200

    items = api_client.get(
        "/api/review/items", params={"status": "open", "email_id": "email_fixture_general"}
    ).json()["items"]
    assert len(items) == 1
    assert items[0]["reason"] == "processing_failed"

    retried = api_client.post(
        f"/api/review/items/{items[0]['id']}/resolve", json={"action": "retry"}
    )
    assert retried.status_code == 200
    assert retried.json()["review_item"]["status"] == "resolved"
