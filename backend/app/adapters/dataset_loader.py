from __future__ import annotations

import json
from pathlib import Path
from typing import Any


class DatasetLoader:
    """Read the bundled fixture dataset without exposing paths outside data/."""

    def __init__(self, data_dir: str | Path, runtime_dir: str | Path | None = None) -> None:
        self.data_dir = Path(data_dir).resolve()
        self.inbox_dir = self.data_dir / "inbox"
        self.attachments_dir = self.data_dir / "attachments"
        self.runtime_dir = Path(runtime_dir).resolve() if runtime_dir else None

    def list_emails(self) -> list[dict[str, Any]]:
        records = []
        for path in sorted(self.inbox_dir.glob("email_*.json")):
            records.append(json.loads(path.read_text(encoding="utf-8")))
        return records

    def get_email(self, email_id: str) -> dict[str, Any]:
        path = self.inbox_dir / f"{email_id}.json"
        if not path.is_file():
            raise FileNotFoundError(email_id)
        return json.loads(path.read_text(encoding="utf-8"))

    def resolve_attachment(self, relative_path: str) -> Path:
        normalized = relative_path.replace("\\", "/").lstrip("/")
        base = self.runtime_dir if self.runtime_dir and normalized.startswith("uploads/") else self.data_dir
        candidate = (base / normalized).resolve()
        if base not in candidate.parents or not candidate.is_file():
            raise FileNotFoundError(relative_path)
        return candidate

    def read_attachment_bytes(self, relative_path: str) -> bytes:
        return self.resolve_attachment(relative_path).read_bytes()

    def read_attachment_text(self, relative_path: str) -> str:
        return self.read_attachment_bytes(relative_path).decode("utf-8", errors="replace")

    def attachment_size(self, relative_path: str) -> int | None:
        try:
            return self.resolve_attachment(relative_path).stat().st_size
        except FileNotFoundError:
            return None
