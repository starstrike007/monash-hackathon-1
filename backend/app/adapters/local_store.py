from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LocalStore:
    """Durable local adapter used for offline development and demo mode."""

    def __init__(self, runtime_dir: str | Path) -> None:
        self.runtime_dir = Path(runtime_dir)
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.runtime_dir / "shipcheck_store.json"
        self.lock = threading.RLock()
        self.state: dict[str, Any] = {
            "runs": {},
            "stages": {},
            "results": {},
            "reviews": [],
            "failures": {},
        }
        if self.path.is_file():
            try:
                self.state.update(json.loads(self.path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                self.persist()

    def persist(self) -> None:
        with self.lock:
            self.path.write_text(json.dumps(self.state, indent=2, ensure_ascii=False), encoding="utf-8")

    def create_run(self, total_emails: int) -> dict[str, Any]:
        run_id = str(uuid.uuid4())
        run = {
            "run_id": run_id,
            "status": "queued",
            "started_at": None,
            "finished_at": None,
            "total_emails": total_emails,
            "summary": {},
            "error_summary": {},
        }
        self.state["runs"][run_id] = run
        self.persist()
        return run

    def update_run(self, run_id: str, **changes: Any) -> dict[str, Any]:
        self.state["runs"].setdefault(run_id, {}).update(changes)
        self.persist()
        return self.state["runs"][run_id]

    def upsert_stage(self, run_id: str, stage_number: int, payload: dict[str, Any]) -> dict[str, Any]:
        key = f"{run_id}:{stage_number}"
        self.state["stages"][key] = {"run_id": run_id, **payload}
        self.persist()
        return self.state["stages"][key]

    def save_result(self, result: dict[str, Any]) -> None:
        run_id = result.get("run_id") or "latest"
        self.state["results"][f"{run_id}:{result['email_id']}"] = result
        self.persist()

    def get_result(self, email_id: str, run_id: str | None = None) -> dict[str, Any] | None:
        if run_id:
            return self.state["results"].get(f"{run_id}:{email_id}")
        candidates = [
            value
            for value in self.state["results"].values()
            if value.get("email_id") == email_id
        ]
        return max(candidates, key=lambda value: value.get("updated_at", ""), default=None)

    def list_latest_results(self) -> list[dict[str, Any]]:
        latest: dict[str, dict[str, Any]] = {}
        for value in self.state["results"].values():
            email_id = value.get("email_id")
            if email_id is None or value.get("updated_at", "") >= latest.get(email_id, {}).get("updated_at", ""):
                latest[email_id] = value
        return list(latest.values())

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return self.state["runs"].get(run_id)

    def latest_run(self) -> dict[str, Any] | None:
        return max(self.state["runs"].values(), key=lambda value: value.get("started_at") or "", default=None)

    def get_stages(self, run_id: str) -> list[dict[str, Any]]:
        stages = [value for value in self.state["stages"].values() if value.get("run_id") == run_id]
        return sorted(stages, key=lambda value: value.get("stage_number", 0))

    def save_failures(self, run_id: str, failures: list[dict[str, Any]]) -> None:
        self.state["failures"][run_id] = failures
        self.persist()

    def get_failures(self, run_id: str) -> list[dict[str, Any]]:
        return self.state.get("failures", {}).get(run_id, [])

    def add_review(self, review: dict[str, Any]) -> None:
        self.state["reviews"].append(review)
        self.persist()


class SupabaseStore(LocalStore):
    """Supabase-backed adapter with the same local cache contract.

    The local cache keeps the UI usable during an unavailable Supabase connection;
    successful writes are mirrored to the configured Supabase tables.
    """

    def __init__(self, runtime_dir: str | Path, url: str, key: str) -> None:
        super().__init__(runtime_dir)
        from supabase import create_client

        self.client = create_client(url, key)

    def _mirror(self, table: str, payload: dict[str, Any], conflict: str | None = None) -> None:
        try:
            query = self.client.table(table).upsert(payload)
            if conflict:
                query = self.client.table(table).upsert(payload, on_conflict=conflict)
            query.execute()
        except Exception:
            # The local cache remains authoritative for offline demo continuity.
            return

    def update_run(self, run_id: str, **changes: Any) -> dict[str, Any]:
        result = super().update_run(run_id, **changes)
        self._mirror("pipeline_runs", result, "id")
        return result

    def save_result(self, result: dict[str, Any]) -> None:
        super().save_result(result)
        self._mirror(
            "results",
            {
                "id": result.get("id") or str(uuid.uuid4()),
                "run_id": result.get("run_id"),
                "email_id": result.get("email_id"),
                "category": result.get("category"),
                "status": result.get("status"),
                "review_reason": result.get("review_reason"),
                "has_defect": result.get("has_defect"),
                "defect_fields": result.get("defect_fields", []),
                "skipped_fields": result.get("skipped_fields", []),
                "updated_at": result.get("updated_at"),
            },
            "run_id,email_id",
        )
