from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.local_store import LocalStore
from app.adapters.openai_client import OpenAIClient
from app.pipeline.orchestrator import PipelineOrchestrator
from app.settings import settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Stage 1 email classifier and export submission JSON.")
    parser.add_argument("--rules-only", action="store_true", help="Skip the OpenAI fallback.")
    parser.add_argument("--data-dir", type=Path, default=None, help="Dataset directory containing inbox/.")
    parser.add_argument("--output-dir", type=Path, default=None, help="Directory for submission and report JSON.")
    parser.add_argument("--runtime-dir", type=Path, default=None, help="Local store directory for this run.")
    parser.add_argument("--max-workers", type=int, default=4, help="Maximum concurrent classification workers.")
    args = parser.parse_args()

    data_dir = (args.data_dir or settings.data_dir).resolve()
    runtime_dir = (args.runtime_dir or settings.runtime_dir / "phase6a-export").resolve()
    loader = DatasetLoader(data_dir)
    llm = None
    if not args.rules_only:
        llm = OpenAIClient(
            settings.openai_api_key,
            settings.openai_model,
            settings.openai_timeout_seconds,
        )
    orchestrator = PipelineOrchestrator(
        loader,
        LocalStore(runtime_dir),
        llm,
        max_workers=args.max_workers,
        output_dir=args.output_dir,
    )
    run = orchestrator.run(rules_only=args.rules_only)
    output_dir = orchestrator._default_output_dir()
    submission_path = output_dir / "submission.json"
    report_path = output_dir / "classification_report.json"
    submission = json.loads(submission_path.read_text(encoding="utf-8"))
    report = json.loads(report_path.read_text(encoding="utf-8"))
    expected_count = len(loader.list_emails())
    if len(submission) != expected_count or len(report) != expected_count:
        raise RuntimeError(
            f"Stage 1 export is incomplete: {len(submission)} submission rows and "
            f"{len(report)} report rows for {expected_count} emails"
        )

    print(
        json.dumps(
            {
                "data_dir": str(data_dir),
                "output_dir": str(output_dir),
                "entries": len(submission),
                "category_counts": dict(Counter(row["category"] for row in submission.values())),
                "decided_by_counts": dict(Counter(row["decided_by"] for row in report.values())),
                "run_status": run["status"],
                "openai_key_found": bool(settings.openai_api_key),
                **orchestrator.last_classification_metrics,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
