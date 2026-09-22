from __future__ import annotations

import json
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


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
            "email_meta": {},
            "review_items": {},
            "audit_log": [],
        }
        self._batch_depth = 0
        self._batch_dirty = False
        if self.path.is_file():
            try:
                self.state.update(json.loads(self.path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                self.persist()

    def persist(self) -> None:
        with self.lock:
            if self._batch_depth:
                self._batch_dirty = True
                return
            self.path.write_text(json.dumps(self.state, indent=2, ensure_ascii=False), encoding="utf-8")

    @contextmanager
    def batch(self) -> Iterator[None]:
        """Defer local JSON persistence until a group of writes completes."""

        with self.lock:
            self._batch_depth += 1
        try:
            yield
        finally:
            with self.lock:
                self._batch_depth -= 1
                should_persist = self._batch_depth == 0 and self._batch_dirty
                if should_persist:
                    self._batch_dirty = False
            if should_persist:
                self.persist()

    def create_run(self, total_emails: int) -> dict[str, Any]:
        with self.lock:
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
        with self.lock:
            self.state["runs"].setdefault(run_id, {}).update(changes)
            self.persist()
            return self.state["runs"][run_id]

    def upsert_stage(self, run_id: str, stage_number: int, payload: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            key = f"{run_id}:{stage_number}"
            self.state["stages"][key] = {"run_id": run_id, **payload}
            self.persist()
            return self.state["stages"][key]

    def save_result(self, result: dict[str, Any]) -> None:
        with self.lock:
            run_id = result.get("run_id") or "latest"
            self.state["results"][f"{run_id}:{result['email_id']}"] = result
            self.persist()

    def get_result(self, email_id: str, run_id: str | None = None) -> dict[str, Any] | None:
        with self.lock:
            if run_id:
                return self.state["results"].get(f"{run_id}:{email_id}")
            candidates = [
                value
                for value in self.state["results"].values()
                if value.get("email_id") == email_id
            ]
            return max(candidates, key=lambda value: value.get("updated_at", ""), default=None)

    def list_latest_results(self) -> list[dict[str, Any]]:
        with self.lock:
            latest: dict[str, dict[str, Any]] = {}
            for value in self.state["results"].values():
                email_id = value.get("email_id")
                if email_id is None or value.get("updated_at", "") >= latest.get(email_id, {}).get("updated_at", ""):
                    latest[email_id] = value
            return list(latest.values())

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self.lock:
            return self.state["runs"].get(run_id)

    def latest_run(self) -> dict[str, Any] | None:
        with self.lock:
            return max(self.state["runs"].values(), key=lambda value: value.get("started_at") or "", default=None)

    def get_stages(self, run_id: str) -> list[dict[str, Any]]:
        with self.lock:
            stages = [value for value in self.state["stages"].values() if value.get("run_id") == run_id]
            return sorted(stages, key=lambda value: value.get("stage_number", 0))

    def save_failures(self, run_id: str, failures: list[dict[str, Any]]) -> None:
        with self.lock:
            self.state["failures"][run_id] = failures
            self.persist()

    def get_failures(self, run_id: str) -> list[dict[str, Any]]:
        with self.lock:
            return self.state.get("failures", {}).get(run_id, [])

    def add_review(self, review: dict[str, Any]) -> None:
        with self.lock:
            self.state["reviews"].append(review)
            self.persist()

    # -- Email metadata: classification provenance + category override -----

    def get_email_meta(self, email_id: str) -> dict[str, Any] | None:
        with self.lock:
            return self.state["email_meta"].get(email_id)

    def list_email_meta(self) -> dict[str, dict[str, Any]]:
        with self.lock:
            return dict(self.state["email_meta"])

    def upsert_email_meta(self, email_id: str, **changes: Any) -> dict[str, Any]:
        with self.lock:
            current = self.state["email_meta"].setdefault(email_id, {"email_id": email_id})
            current.update(changes)
            self.persist()
            return current

    def append_email_attachment(self, email_id: str, path: str) -> dict[str, Any]:
        meta = self.get_email_meta(email_id) or {"email_id": email_id}
        paths = list(meta.get("uploaded_attachments") or [])
        if path not in paths:
            paths.append(path)
        return self.upsert_email_meta(email_id, uploaded_attachments=paths)

    # -- Review queue --------------------------------------------------------

    def add_review_item(self, item: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            item = dict(item)
            item.setdefault("id", str(uuid.uuid4()))
            item.setdefault("status", "open")
            item.setdefault("created_at", utc_now())
            item.setdefault("resolved_at", None)
            item.setdefault("resolution", None)
            self.state["review_items"][item["id"]] = item
            self.persist()
            return item

    def get_review_item(self, item_id: str) -> dict[str, Any] | None:
        with self.lock:
            return self.state["review_items"].get(item_id)

    def update_review_item(self, item_id: str, **changes: Any) -> dict[str, Any]:
        with self.lock:
            current = self.state["review_items"].setdefault(item_id, {"id": item_id})
            current.update(changes)
            self.persist()
            return current

    def list_review_items(
        self, status: str | None = None, email_id: str | None = None
    ) -> list[dict[str, Any]]:
        with self.lock:
            items = list(self.state["review_items"].values())
            if status:
                items = [item for item in items if item.get("status") == status]
            if email_id:
                items = [item for item in items if item.get("email_id") == email_id]
            return sorted(items, key=lambda item: item.get("created_at") or "")

    # -- Audit log (append-only) ---------------------------------------------

    def add_audit_entry(self, entry: dict[str, Any]) -> dict[str, Any]:
        with self.lock:
            entry = dict(entry)
            entry.setdefault("id", str(uuid.uuid4()))
            entry.setdefault("created_at", utc_now())
            self.state["audit_log"].append(entry)
            self.persist()
            return entry

    def list_audit_log(self, email_id: str | None = None) -> list[dict[str, Any]]:
        with self.lock:
            entries = self.state["audit_log"]
            if email_id:
                entries = [entry for entry in entries if entry.get("email_id") == email_id]
            return entries


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

    def create_run(self, total_emails: int) -> dict[str, Any]:
        run = super().create_run(total_emails)
        self._mirror(
            "pipeline_runs",
            {
                "id": run["run_id"],
                "status": run["status"],
                "started_at": run["started_at"],
                "finished_at": run["finished_at"],
                "total_emails": run["total_emails"],
                "summary": run["summary"],
                "error_summary": run["error_summary"],
            },
            "id",
        )
        return run

    def upsert_stage(self, run_id: str, stage_number: int, payload: dict[str, Any]) -> dict[str, Any]:
        stage = super().upsert_stage(run_id, stage_number, payload)
        self._mirror(
            "pipeline_run_stages",
            {
                "run_id": run_id,
                "stage_number": stage_number,
                "stage_name": stage.get("stage_name"),
                "status": stage.get("status"),
                "processed_count": stage.get("processed_count", 0),
                "total_count": stage.get("total_count", 0),
                "failed_count": stage.get("failed_count", 0),
                "review_count": stage.get("review_count", 0),
                "details": stage.get("details", {}),
            },
            "run_id,stage_number",
        )
        return stage

    def update_run(self, run_id: str, **changes: Any) -> dict[str, Any]:
        result = super().update_run(run_id, **changes)
        self._mirror(
            "pipeline_runs",
            {
                "id": run_id,
                "status": result.get("status"),
                "started_at": result.get("started_at"),
                "finished_at": result.get("finished_at"),
                "total_emails": result.get("total_emails", 0),
                "summary": result.get("summary", {}),
                "error_summary": result.get("error_summary", {}),
            },
            "id",
        )
        return result

    def save_result(self, result: dict[str, Any]) -> None:
        super().save_result(result)
        result_id = result.get("id") or str(
            uuid.uuid5(uuid.NAMESPACE_URL, f"shipcheck:{result.get('run_id')}:{result.get('email_id')}")
        )
        self._mirror(
            "results",
            {
                "id": result_id,
                "run_id": result.get("run_id"),
                "email_id": result.get("email_id"),
                "category": result.get("category"),
                "status": result.get("status"),
                "review_reason": result.get("review_reason"),
                "has_defect": result.get("has_defect"),
                "defect_fields": result.get("defect_fields", []),
                "skipped_fields": result.get("skipped_fields", []),
                "si_path": result.get("selected_si_path"),
                "bl_path": result.get("selected_bl_path"),
                "version": result.get("version", 1),
                "updated_at": result.get("updated_at"),
            },
            "run_id,email_id",
        )
        for document in result.get("documents", []):
            role = document.get("role")
            if not role:
                continue
            for field in document.get("fields", []):
                evidence = field.get("evidence") or {}
                location = {
                    key: evidence.get(key)
                    for key in (
                        "page",
                        "line",
                        "sheet",
                        "cell",
                        "table_index",
                        "row_index",
                        "paragraph_index",
                        "bbox",
                        "quoted_text",
                    )
                    if evidence.get(key) is not None
                }
                self._mirror(
                    "field_extractions",
                    {
                        "result_id": result_id,
                        "document_role": role,
                        "field_name": field.get("field_name"),
                        "state": field.get("state"),
                        "raw_value": field.get("raw_value"),
                        "normalized_value": field.get("normalized_value"),
                        "source": field.get("source"),
                        "confidence": field.get("confidence"),
                        "evidence": evidence,
                        "location": location or None,
                    },
                    "result_id,document_role,field_name",
                )

    def add_review(self, review: dict[str, Any]) -> None:
        super().add_review(review)
        current = self.get_result(review.get("email_id", "")) or {}
        result_id = current.get("id") or str(
            uuid.uuid5(uuid.NAMESPACE_URL, f"shipcheck:{current.get('run_id')}:{current.get('email_id')}")
        )
        self._mirror(
            "review_decisions",
            {
                "result_id": result_id,
                "field_name": review.get("field_name"),
                "action": review.get("action"),
                "original_value": review.get("original_value"),
                "corrected_value": review.get("corrected_value"),
                "reviewer_id": review.get("reviewer_id"),
                "created_at": review.get("created_at"),
                "metadata": {"evidence": review.get("evidence") or {}},
            },
        )

    def upsert_email_meta(self, email_id: str, **changes: Any) -> dict[str, Any]:
        meta = super().upsert_email_meta(email_id, **changes)
        self._mirror(
            "emails",
            {
                "email_id": email_id,
                "received_at": meta.get("received_at"),
                "classification_method": meta.get("classification_method"),
                "classification_reason": meta.get("classification_reason"),
                "category_machine": meta.get("category_machine"),
                "category_override": meta.get("category_override"),
                "override_by": meta.get("override_by"),
                "override_at": meta.get("override_at"),
                "uploaded_attachments": meta.get("uploaded_attachments", []),
                "excluded_attachments": meta.get("excluded_attachments", []),
            },
            "email_id",
        )
        return meta

    def add_review_item(self, item: dict[str, Any]) -> dict[str, Any]:
        item = super().add_review_item(item)
        self._mirror_review_item(item)
        return item

    def update_review_item(self, item_id: str, **changes: Any) -> dict[str, Any]:
        item = super().update_review_item(item_id, **changes)
        self._mirror_review_item(item)
        return item

    def _mirror_review_item(self, item: dict[str, Any]) -> None:
        self._mirror(
            "review_items",
            {
                "id": item.get("id"),
                "email_id": item.get("email_id"),
                "reason": item.get("reason"),
                "status": item.get("status"),
                "description": item.get("description"),
                "evidence": item.get("evidence") or {},
                "created_at": item.get("created_at"),
                "resolved_at": item.get("resolved_at"),
                "resolution": item.get("resolution"),
            },
            "id",
        )

    def add_audit_entry(self, entry: dict[str, Any]) -> dict[str, Any]:
        entry = super().add_audit_entry(entry)
        self._mirror(
            "audit_log",
            {
                "id": entry.get("id"),
                "email_id": entry.get("email_id"),
                "action": entry.get("action"),
                "before": entry.get("before"),
                "after": entry.get("after"),
                "actor": entry.get("actor"),
                "evidence_ref": entry.get("evidence_ref"),
                "evidence": entry.get("evidence"),
                "created_at": entry.get("created_at"),
            },
            "id",
        )
        return entry
