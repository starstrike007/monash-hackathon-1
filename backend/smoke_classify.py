from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.openai_client import OpenAIClient
from app.pipeline.classify import classification_context
from app.settings import settings


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the Stage 1 LLM classifier on the first N inbox emails."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Number of emails from the start of the dataset to send to the LLM (default: 5).",
    )
    parser.add_argument("--data-dir", type=Path, default=None)
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be at least 1")

    data_dir = (args.data_dir or settings.data_dir).resolve()
    loader = DatasetLoader(data_dir)
    client = OpenAIClient(
        settings.openai_api_key,
        settings.openai_model,
        settings.openai_timeout_seconds,
        reasoning_effort=settings.openai_reasoning_effort_classify,
    )

    for email in loader.list_emails()[: args.limit]:
        result = client.propose_classification_result(classification_context(email))
        row: dict[str, object] = {
            "email_id": email.get("email_id"),
            "category": result.proposal.category.value if result.proposal else None,
            "confidence": result.proposal.confidence.value if result.proposal else None,
        }
        if result.proposal is not None:
            row["reason"] = result.proposal.reason
        else:
            row.update(
                {
                    "failure_reason_code": result.failure_reason_code,
                    "exception_class": result.exception_class,
                    "exception_message": result.exception_message,
                }
            )
        print(json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    main()
