from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
import logging
import re
import unicodedata
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
from app.pipeline.normalize import normalize_field


logger = logging.getLogger(__name__)

STAGES = ((1, "Classify"), (2, "Extract & normalize"), (3, "Compare"), (4, "Decide"))


def _compact_evidence_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\W+", "", normalized, flags=re.UNICODE)


def _source_snippet(source_text: str, candidate: str) -> str:
    candidate_text = _compact_evidence_text(candidate)
    for line in source_text.splitlines():
        if candidate_text and candidate_text in _compact_evidence_text(line):
            return line.strip()[:500]
    return candidate[:500]


class PipelineOrchestrator:
    def __init__(
        self,
        loader: DatasetLoader,
        store: LocalStore,
        llm: OpenAIClient | None = None,
        max_workers: int = 4,
        output_dir: str | Path | None = None,
        stage2_llm_fallback: bool = False,
        llm_consecutive_failure_threshold: int = 5,
        llm_degraded_failure_share: float = 0.10,
    ) -> None:
        self.loader = loader
        self.store = store
        self.llm = llm
        self.max_workers = max(1, int(max_workers))
        self.output_dir = Path(output_dir).resolve() if output_dir else None
        self.stage2_llm_fallback = bool(stage2_llm_fallback)
        self.llm_consecutive_failure_threshold = max(1, int(llm_consecutive_failure_threshold))
        self.llm_degraded_failure_share = min(1.0, max(0.0, float(llm_degraded_failure_share)))
        self.last_classification_metrics: dict[str, Any] = {}
        self.last_stage2_metrics: dict[str, Any] = {
            "stage2_llm_fallback": self.stage2_llm_fallback,
            "stage2_llm_calls": 0,
            "stage2_llm_errors": 0,
            "stage2_llm_input_tokens": 0,
            "stage2_llm_output_tokens": 0,
            "stage2_llm_reasoning_tokens": 0,
        }

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
        self.last_stage2_metrics = {
            "stage2_llm_fallback": self.stage2_llm_fallback,
            "stage2_llm_calls": 0,
            "stage2_llm_errors": 0,
            "stage2_llm_input_tokens": 0,
            "stage2_llm_output_tokens": 0,
            "stage2_llm_reasoning_tokens": 0,
        }
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
        classifier = ClassificationService(
            self.llm,
            rules_only=rules_only,
            consecutive_failure_threshold=self.llm_consecutive_failure_threshold,
        )
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

        classification_metrics = classifier.metrics
        classification_failure_count = int(classification_metrics.get("failures", 0))
        classification_failure_share = classification_failure_count / max(1, len(emails))
        classification_metrics.update(
            {
                "failure_share": round(classification_failure_share, 6),
                "degraded_failure_share_threshold": self.llm_degraded_failure_share,
            }
        )
        self.last_classification_metrics = classification_metrics
        if failures:
            run_status = "failed"
        elif classification_failure_share > self.llm_degraded_failure_share:
            run_status = "degraded"
        else:
            run_status = "complete"

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
        error_summary: dict[str, int] = {}
        if failures:
            error_summary["failed_items"] = len(failures)
        if classification_failure_count:
            error_summary["llm_failed_items"] = classification_failure_count
        self.store.update_run(
            run_id,
            status=run_status,
            finished_at=datetime.now(timezone.utc).isoformat(),
            summary=dict(counters),
            error_summary=error_summary,
        )
        self.store.save_failures(run_id, failures)
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
            "confidence": decision.confidence.value,
            "low_confidence": decision.low_confidence,
            "model_failure": decision.model_failure,
            "reason": decision.reason,
            "failure_reason_code": decision.failure_reason_code,
            "attempts": decision.attempts,
            "exception_class": decision.exception_class,
            "exception_message": decision.exception_message,
            "usage": decision.usage,
            "latency_seconds": decision.latency_seconds,
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
        if any(document.missing for document in parsed_documents):
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=documents,
                document_reason=ReviewReason.MISSING_ATTACHMENT,
                notes=["At least one referenced attachment was not available."],
            )
        if any(not document.readable for document in parsed_documents):
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=documents,
                document_reason=ReviewReason.UNREADABLE,
                notes=["At least one referenced attachment could not be read safely."],
            )
        if len(si_documents) == 0 or len(bl_documents) == 0:
            # A single supported document is evidence that the other required
            # document was not attached. A readable non-SI/BL candidate is a
            # wrong-type resolution instead of an invented selection.
            if len(documents) == 1 and (si_documents or bl_documents):
                reason = ReviewReason.MISSING_ATTACHMENT
            elif len(si_documents) == 0 and len(bl_documents) == 0 and not documents:
                reason = ReviewReason.MISSING_ATTACHMENT
            else:
                reason = ReviewReason.WRONG_DOC_TYPE
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
        if not self.stage2_llm_fallback or not self.llm or not getattr(self.llm, "available", False) or not parsed.readable:
            return document
        unresolved = [
            field.field_name.value
            for field in document.fields
            if field.state in {ExtractionState.MISSING, ExtractionState.AMBIGUOUS}
        ]
        if not unresolved:
            return document
        self.last_stage2_metrics["stage2_llm_calls"] += 1
        proposal = self.llm.propose_fields(
            {
                "document_path": parsed.path,
                "document_type": parsed.document_type.value,
                "fields": unresolved,
                "source_text": parsed.text[:15000],
            }
        )
        usage = getattr(self.llm, "last_extraction_usage", None)
        if isinstance(usage, dict):
            document.llm_usage = {
                key: max(0, int(usage.get(key, 0) or 0))
                for key in ("input_tokens", "output_tokens", "reasoning_tokens")
            }
            self.last_stage2_metrics["stage2_llm_input_tokens"] += document.llm_usage["input_tokens"]
            self.last_stage2_metrics["stage2_llm_output_tokens"] += document.llm_usage["output_tokens"]
            self.last_stage2_metrics["stage2_llm_reasoning_tokens"] += document.llm_usage["reasoning_tokens"]
        if not proposal:
            self.last_stage2_metrics["stage2_llm_errors"] += 1
            return document
        source_text = _compact_evidence_text(parsed.text)
        for field in document.fields:
            if field.field_name.value not in unresolved:
                continue
            proposed = proposal.get(field.field_name.value)
            if isinstance(proposed, dict):
                proposed = proposed.get("value")
            if not isinstance(proposed, str) or not proposed.strip():
                continue
            candidate_text = _compact_evidence_text(proposed)
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
                snippet=_source_snippet(parsed.text, proposed),
                source_path=parsed.path,
            )
        return document
