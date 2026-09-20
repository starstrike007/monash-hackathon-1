from __future__ import annotations

from pathlib import Path


CLASSIFICATION_PROMPT_VERSION = "classify_v1"
CLASSIFICATION_PROMPT_PATH = Path(__file__).with_name("classify_v1.md")
CLASSIFICATION_PROMPT = CLASSIFICATION_PROMPT_PATH.read_text(encoding="utf-8").strip()
