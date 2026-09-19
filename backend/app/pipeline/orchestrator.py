from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
import logging
import re
from pathlib import Path
from typing import Any

from app.adapters.dataset_loader import DatasetLoader
from app.adapters.document_parsers import parse_attachment
from app.adapters.local_store import LocalStore
from app.adapters.openai_client import OpenAIClient
from app.api.schemas.common import (
    Confidence,
    DocumentRole,
    DocumentType,
    EmailCategory,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    ReviewReason,
    dump_model,
)
from app.api.schemas.pipeline import PipelineStageProgress
from app.services.submission_service import build_submission
from app.pipeline.classify import ClassificationDecision, ClassificationService, classify_email
from app.pipeline.compare import compare_documents
from app.pipeline.decide import decide_result
from app.pipeline.extract import extract_document
from app.pipeline.normalize import normalize_field, normalize_text


logger = logging.getLogger(__name__)

STAGES = ((1, "Classify"), (2, "Extract & normalize"), (3, "Compare"), (4, "Decide"))


class PipelineOrchestrator:
    def __init__(
        self,
        loader: DatasetLoader,
        store: LocalStore,
        llm: OpenAIClient | None = None,
        max_workers: int = 4,
        output_dir: str | Path | None = None,
    ) -> None:
        self.loader = loader
        self.store = store
        self.llm = llm
        self.max_workers = max(1, int(max_workers))
        self.output_dir = Path(output_dir).resolve() if output_dir else None
        self.last_classification_metrics: dict[str, int | bool] = {}

    def _default_output_dir(self) -> Path:
        """Keep fixture/custom-dataset exports from clobbering the submission."""

        if self.output_dir is not None:
            return self.output_dir
        project_root = Path(__file__).resolve().parents[3]
        primary_data_dir = (project_root / "data").resolve()
        if self.loader.data_dir == primary_data_dir:
            return Path(__file__).resolve().parents[2] / "output"
        return Path(self.store.runtime_dir) / "output"

    def ensure_seeded(self) -> None:
        if self.store.list_latest_results():
            return
        self.run()

    def run(
        self,
        email_ids: list[str] | None = None,
        retry_failed_only: bool = False,
        rules_only: bool = False,
    ) -> dict[str, Any]:
        run_full_dataset = email_ids is None and not retry_failed_only
        emails = self.loader.list_emails()
        if retry_failed_only and not email_ids:
            latest_run = self.store.latest_run()
            if latest_run:
                email_ids = [
                    failure.get("email_id")
                    for failure in self.store.get_failures(latest_run["run_id"])
                    if failure.get("email_id")
                ]
        if email_ids:
            wanted = set(email_ids)
            emails = [email for email in emails if email.get("email_id") in wanted]
        run = self.store.create_run(len(emails))
        run_id = run["run_id"]
        self.store.update_run(run_id, status="running", started_at=datetime.now(timezone.utc).isoformat())
        for stage_number, stage_name in STAGES:
            self.store.upsert_stage(
                run_id,
                stage_number,
                PipelineStageProgress(
                    stage_number=stage_number,
                    stage_name=stage_name,
                    status="running",
                    total_count=len(emails),
                ).model_dump(mode="json"),
            )

        counters: Counter[str] = Counter()
        failures: list[dict[str, Any]] = []
        stage_counts = {number: 0 for number, _ in STAGES}
        classification_report: dict[str, dict[str, Any]] = {}
        classifier = ClassificationService(self.llm, rules_only=rules_only)
        decisions = classifier.classify_many(emails, max_workers=self.max_workers)
        for email, decision in zip(emails, decisions):
            email_id = email["email_id"]
            try:
                result = self.process_email(email, run_id, category=decision.category)
                self.store.save_result(dump_model(result))
                counters[result.category.value] += 1
                if result.status:
                    counters[result.status.value] += 1
                for stage_number in stage_counts:
                    stage_counts[stage_number] += 1
                classification_report[email_id] = self._classification_report_row(email, decision)
            except Exception as exc:
                logger.exception("Stage 1 failed for %s", email_id)
                failures.append({"email_id": email_id, "message": str(exc), "retryable": True})

        for stage_number, stage_name in STAGES:
            status = "partial" if failures else "complete"
            self.store.upsert_stage(
                run_id,
                stage_number,
                PipelineStageProgress(
                    stage_number=stage_number,
                    stage_name=stage_name,
                    status=status,
                    processed_count=stage_counts[stage_number],
                    total_count=len(emails),
                    failed_count=len(failures) if stage_number in (1, 2) else 0,
                    review_count=sum(
                        1
                        for item in self.store.list_latest_results()
                        if item.get("status") == "NEEDS_REVIEW"
                    ),
                ).model_dump(mode="json"),
            )
        self.store.update_run(
            run_id,
            status="complete" if not failures else "failed",
            finished_at=datetime.now(timezone.utc).isoformat(),
            summary=dict(counters),
            error_summary={"failed_items": len(failures)} if failures else {},
        )
        self.store.save_failures(run_id, failures)
        self.last_classification_metrics = classifier.metrics
        if run_full_dataset:
            self.export_outputs(classification_report)
        return self.store.get_run(run_id) or run

    def export_submission(self, output_path: str | Path | None = None) -> dict[str, dict[str, Any]]:
        """Write the evaluator-shaped submission for every bundled email."""

        email_ids = [email["email_id"] for email in self.loader.list_emails()]
        submission = build_submission(self.store, email_ids)
        path = Path(output_path) if output_path else self._default_output_dir() / "submission.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(submission, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return submission

    def export_outputs(
        self,
        classification_report: dict[str, dict[str, Any]],
        output_dir: str | Path | None = None,
    ) -> dict[str, dict[str, Any]]:
        output_path = Path(output_dir) if output_dir else self._default_output_dir()
        output_path.mkdir(parents=True, exist_ok=True)
        submission = self.export_submission(output_path / "submission.json")
        (output_path / "classification_report.json").write_text(
            json.dumps(classification_report, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        return submission

    @staticmethod
    def _classification_report_row(
        email: dict[str, Any],
        decision: ClassificationDecision,
    ) -> dict[str, Any]:
        return {
            "category": decision.category.value,
            "decided_by": decision.decided_by,
            "low_confidence": decision.low_confidence,
            "model_failure": decision.model_failure,
            "reason": decision.reason,
            "subject": str(email.get("subject", "")),
        }

    def process_email(
        self,
        email: dict[str, Any],
        run_id: str,
        category: EmailCategory | None = None,
    ):
        email_id = email["email_id"]
        category = category or self.classify_email(email)
        if category != EmailCategory.BL_COMPARISON:
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=[],
            )

        attachment_paths = email.get("attachments", [])
        if not attachment_paths:
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=[],
                document_reason=ReviewReason.MISSING_ATTACHMENT,
                notes=["No attachments were referenced by the email."],
            )

        parsed_documents = [parse_attachment(self.loader, path) for path in attachment_paths]
        documents = []
        for parsed in parsed_documents:
            role = None
            if parsed.document_type == DocumentType.SHIPPING_INSTRUCTION:
                role = DocumentRole.SI
            elif parsed.document_type == DocumentType.BILL_OF_LADING:
                role = DocumentRole.BL
            documents.append(self.extract_document(parsed, role))

        si_documents = [document for document in documents if document.role == DocumentRole.SI]
        bl_documents = [document for document in documents if document.role == DocumentRole.BL]
        reason: ReviewReason | None = None
        notes: list[str] = []
        if len(si_documents) == 0 or len(bl_documents) == 0:
            reason = ReviewReason.WRONG_DOC_TYPE if all(document.readable for document in documents) else ReviewReason.UNREADABLE
            if len(si_documents) == 0 and len(bl_documents) == 0:
                reason = ReviewReason.MISSING_ATTACHMENT
            notes.append("The SI and BL could not be resolved unambiguously from the attachments.")
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=documents,
                document_reason=reason,
                notes=notes,
            )
        if len(si_documents) > 1 or len(bl_documents) > 1:
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=documents,
                document_reason=ReviewReason.WRONG_DOC_TYPE,
                notes=["More than one SI or BL candidate was found."],
            )

        comparisons = compare_documents(si_documents[0], bl_documents[0])
        return decide_result(
            email_id=email_id,
            run_id=run_id,
            category=category,
            comparisons=comparisons,
            documents=documents,
            notes=notes,
        )

    def classify_email(self, email: dict[str, Any]) -> EmailCategory:
        return classify_email(email, llm=self.llm)

    def extract_document(self, parsed, role: DocumentRole | None):
        document = extract_document(parsed, role)
        if not self.llm or not self.llm.available or not parsed.readable:
            return document
        unresolved = [
            field.field_name.value
            for field in document.fields
            if field.state in {ExtractionState.MISSING, ExtractionState.AMBIGUOUS}
        ]
        if not unresolved:
            return document
        proposal = self.llm.propose_fields(
            {
                "document_path": parsed.path,
                "document_type": parsed.document_type.value,
                "fields": unresolved,
                "source_text": parsed.text[:15000],
            }
        )
        if not proposal:
            return document
        source_text = re.sub(r"[^a-z0-9]+", "", normalize_text(parsed.text).lower())
        for field in document.fields:
            proposed = proposal.get(field.field_name.value)
            if isinstance(proposed, dict):
                proposed = proposed.get("value")
            if not isinstance(proposed, str) or not proposed.strip():
                continue
            candidate_text = re.sub(r"[^a-z0-9]+", "", normalize_text(proposed).lower())
            if not candidate_text or candidate_text not in source_text:
                continue
            normalized = normalize_field(field.field_name, proposed)
            if normalized is None:
                continue
            field.raw_value = proposed
            field.normalized_value = normalized
            field.state = ExtractionState.FOUND
            field.source = ExtractionSource.LLM
            field.confidence = Confidence.MEDIUM
            field.evidence = FieldEvidence(
                snippet=f"Validated model value: {proposed}",
                source_path=parsed.path,
            )
        return document
