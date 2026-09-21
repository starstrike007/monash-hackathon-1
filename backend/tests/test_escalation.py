from __future__ import annotations

from .test_override_review_export import api_client  # noqa: F401  (shared fixture)


def _open_items(client, email_id):
    return client.get("/api/review/items", params={"status": "open", "email_id": email_id}).json()["items"]


def test_escalating_a_clean_comparison_opens_one_human_review_item(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    assert _open_items(api_client, "email_fixture_ok") == []

    response = api_client.post("/api/emails/email_fixture_ok/escalate", json={"reviewer_id": "qa"})
    assert response.status_code == 200
    item = response.json()
    assert item["reason"] == "manual_escalation"
    assert item["status"] == "open"
    assert item["evidence"]["escalated_by"] == "qa"

    # Escalating again returns the same item instead of adding a duplicate.
    again = api_client.post("/api/emails/email_fixture_ok/escalate").json()
    assert again["id"] == item["id"]
    assert len(_open_items(api_client, "email_fixture_ok")) == 1


def test_escalated_item_is_exported_as_needs_review_with_an_accepted_reason(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    before = api_client.get("/api/export/submission").json()["email_fixture_ok"]
    assert before["status"] == "OK"

    api_client.post("/api/emails/email_fixture_ok/escalate")
    after = api_client.get("/api/export/submission").json()["email_fixture_ok"]
    assert after["status"] == "NEEDS_REVIEW"
    assert after["review_reason"] == "missing_value"  # one of the four reasons the evaluator accepts


def test_rerunning_the_pipeline_does_not_clear_an_escalation(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    item = api_client.post("/api/emails/email_fixture_ok/escalate").json()

    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    still_open = _open_items(api_client, "email_fixture_ok")
    assert [entry["id"] for entry in still_open] == [item["id"]]


def test_marking_an_escalation_reviewed_closes_it_and_restores_the_export(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_ok"]})
    item = api_client.post("/api/emails/email_fixture_ok/escalate").json()

    resolve = api_client.post(
        f"/api/review/items/{item['id']}/resolve",
        json={"action": "mark_reviewed", "note": "Checked against both documents", "reviewer_id": "qa"},
    )
    assert resolve.status_code == 200
    assert resolve.json()["review_item"]["status"] == "resolved"
    assert resolve.json()["review_item"]["resolution"]["note"] == "Checked against both documents"
    assert _open_items(api_client, "email_fixture_ok") == []
    assert api_client.get("/api/export/submission").json()["email_fixture_ok"]["status"] == "OK"


def test_mark_reviewed_is_only_for_escalated_items(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_placeholder"]})
    item = _open_items(api_client, "email_fixture_placeholder")[0]
    response = api_client.post(f"/api/review/items/{item['id']}/resolve", json={"action": "mark_reviewed"})
    assert response.status_code == 400


def test_only_comparisons_with_a_result_can_be_escalated(api_client):
    api_client.post("/api/pipeline/run", json={"email_ids": ["email_fixture_general"]})
    assert api_client.post("/api/emails/email_fixture_general/escalate").status_code == 400
    assert api_client.post("/api/emails/no_such_email/escalate").status_code == 404
