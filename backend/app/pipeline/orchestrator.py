from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import json
import logging
import re
from threading import Lock, Thread
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
from app.services.review_queue_service import (
    clear_processing_failure,
    sync_processing_failure,
    sync_review_item,
)
from app.services.submission_service import build_submission
from app.services.timestamps import ensure_received_timestamps, generate_received_at
from app.pipeline.classify import ClassificationDecision, ClassificationService, classify_email
from app.pipeline.compare import compare_documents
from app.pipeline.decide import decide_result
from app.pipeline.extract import _LOCATION_KEYS, extract_document, locate_value
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
        self.last_classification_metrics: dict[str, Any] = {}
        self._bootstrap_lock = Lock()
        self._bootstrap_state: dict[str, Any] | None = None
        self._bootstrap_thread: Thread | None = None

    def _default_output_dir(self) -> Path:
        """Keep fixture/custom-dataset exports from clobbering the submission."""

        if self.output_dir is not None:
            return self.output_dir
        project_root = Path(__file__).resolve().parents[3]
        primary_data_dir = (project_root / "data").resolve()
        if self.loader.data_dir == primary_data_dir:
            return Path(__file__).resolve().parents[2] / "output"
        return Path(self.store.runtime_dir) / "output"

    @staticmethod
    def _bootstrap_percentage(processed_count: int, total_emails: int) -> int:
        if total_emails <= 0:
            return 100
        return max(0, min(100, round((processed_count / total_emails) * 100)))

    def _update_bootstrap_state(self, **changes: Any) -> dict[str, Any] | None:
        with self._bootstrap_lock:
            if self._bootstrap_state is None:
                return None
            self._bootstrap_state.update(changes)
            return dict(self._bootstrap_state)

    def _update_bootstrap_progress(
        self,
        run_id: str,
        processed_count: int,
        total_emails: int,
        stage: str,
        message: str,
    ) -> None:
        with self._bootstrap_lock:
            if not self._bootstrap_state or self._bootstrap_state.get("run_id") not in {None, run_id}:
                return
            if self._bootstrap_state.get("status") not in {"queued", "running"}:
                return
            self._bootstrap_state.update(
                {
                    "status": "running",
                    "run_id": run_id,
                    "total_emails": total_emails,
                    "processed_count": processed_count,
                    "percentage": self._bootstrap_percentage(processed_count, total_emails),
                    "stage": stage,
                    "message": message,
                }
            )

    def _run_bootstrap(self) -> None:
        try:
            self._update_bootstrap_state(
                status="running",
                stage="Starting pipeline",
                message="Preparing the email corpus…",
            )
            run = self.run()
            with self._bootstrap_lock:
                bootstrap_total = (self._bootstrap_state or {}).get("total_emails", 0)
            total_emails = int(run.get("total_emails") or bootstrap_total)
            run_status = run.get("status")
            message = (
                "Dashboard data is ready."
                if run_status == "complete"
                else "Dashboard data is ready; some items may need a retry."
            )
            self._update_bootstrap_state(
                status="complete",
                run_id=run.get("run_id"),
                total_emails=total_emails,
                processed_count=total_emails,
                percentage=100,
                stage="Ready",
                message=message,
            )
        except Exception as exc:
            logger.exception("Dashboard bootstrap failed")
            self._update_bootstrap_state(
                status="failed",
                percentage=0,
                stage="Unable to load",
                message=str(exc)[:240] or "The initial pipeline run failed.",
            )

    def get_bootstrap_status(self) -> dict[str, Any]:
        with self._bootstrap_lock:
            if self._bootstrap_state and self._bootstrap_state.get("status") in {"queued", "running"}:
                return dict(self._bootstrap_state)

        latest_run = self.store.latest_run()
        latest_results = self.store.list_latest_results()
        if latest_run or latest_results:
            total_emails = int(
                (latest_run or {}).get("total_emails") or len(self.loader.list_emails())
            )
            processed_count = len(latest_results)
            if latest_run:
                stages = self.store.get_stages(latest_run["run_id"])
                stage_counts = [int(stage.get("processed_count") or 0) for stage in stages]
                processed_count = max([processed_count, *stage_counts])
            run_status = (latest_run or {}).get("status")
            if run_status == "running":
                return {
                    "status": "running",
                    "run_id": latest_run.get("run_id"),
                    "total_emails": total_emails,
                    "processed_count": processed_count,
                    "percentage": self._bootstrap_percentage(processed_count, total_emails),
                    "stage": "Processing emails",
                    "message": f"Processed {processed_count} of {total_emails} emails.",
                }
            return {
                "status": "ready",
                "run_id": (latest_run or {}).get("run_id"),
                "total_emails": total_emails,
                "processed_count": total_emails,
                "percentage": 100,
                "stage": "Ready",
                "message": "Dashboard data is ready.",
            }

        return {
            "status": "idle",
            "run_id": None,
            "total_emails": len(self.loader.list_emails()),
            "processed_count": 0,
            "percentage": 0,
            "stage": "Waiting to start",
            "message": "Preparing the dashboard data…",
        }

    def start_bootstrap(self) -> dict[str, Any]:
        with self._bootstrap_lock:
            if self._bootstrap_state and self._bootstrap_state.get("status") in {"queued", "running"}:
                return dict(self._bootstrap_state)

            latest_run = self.store.latest_run()
            latest_results = self.store.list_latest_results()
            has_existing_data = bool(latest_run or latest_results)

            if not has_existing_data:
                total_emails = len(self.loader.list_emails())
                self._bootstrap_state = {
                    "status": "queued",
                    "run_id": None,
                    "total_emails": total_emails,
                    "processed_count": 0,
                    "percentage": 0,
                    "stage": "Queued",
                    "message": "Starting the dashboard pipeline…",
                }
                self._bootstrap_thread = Thread(
                    target=self._run_bootstrap,
                    name="dashboard-bootstrap",
                    daemon=True,
                )
                self._bootstrap_thread.start()
                return dict(self._bootstrap_state)

        return self.get_bootstrap_status()

    def ensure_seeded(self) -> None:
        # A run can legitimately finish with no saved result for a failed
        # item. The run record still proves the store has been initialized;
        # reseeding here would erase the visible retryable failure.
        with self._bootstrap_lock:
            if self._bootstrap_state and self._bootstrap_state.get("status") in {"queued", "running"}:
                return
        latest_results = self.store.list_latest_results()
        latest_run = self.store.latest_run()
        if latest_results or latest_run:
            ensure_received_timestamps(self.store, self.loader)
            # Older local stores may contain completed results from before the
            # review queue was introduced. Reconcile them on the first API
            # request so NEEDS_REVIEW results are not stranded outside the UI.
            review_items = self.store.list_review_items()
            open_review_emails = {
                item.get("email_id")
                for item in review_items
                if item.get("status") == "open" and item.get("reason") != "processing_failed"
            }
            review_results = [
                result
                for result in latest_results
                if result.get("status") == "NEEDS_REVIEW"
                and result.get("review_reason")
                and result.get("email_id") not in open_review_emails
            ]
            failures = self.store.get_failures(latest_run["run_id"]) if latest_run else []
            processing_failure_emails = {
                item.get("email_id")
                for item in review_items
                if item.get("status") == "open" and item.get("reason") == "processing_failed"
            }
            missing_failures = [
                failure
                for failure in failures
                if failure.get("email_id") and failure.get("email_id") not in processing_failure_emails
            ]
            if review_results or missing_failures:
                with self.store.batch():
                    for result in review_results:
                        sync_review_item(self.store, result)
                    for failure in missing_failures:
                        sync_processing_failure(
                            self.store,
                            failure["email_id"],
                            failure.get("message", "Processing failed."),
                        )
            return
        self.run()
        ensure_received_timestamps(self.store, self.loader)

    def _with_runtime_attachments(self, email: dict[str, Any]) -> dict[str, Any]:
        """Merge reviewer-uploaded attachments into the immutable dataset email."""

        meta = self.store.get_email_meta(email["email_id"]) or {}
        excluded = set(meta.get("excluded_attachments") or [])
        paths: list[str] = []
        for path in [*(email.get("attachments") or []), *(meta.get("uploaded_attachments") or [])]:
            if path not in excluded and path not in paths:
                paths.append(path)
        return {**email, "attachments": paths}

    def run(
        self,
        email_ids: list[str] | None = None,
        retry_failed_only: bool = False,
        rules_only: bool = False,
    ) -> dict[str, Any]:
        run_full_dataset = email_ids is None and not retry_failed_only
        emails = [self._with_runtime_attachments(email) for email in self.loader.list_emails()]
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
        with self._bootstrap_lock:
            bootstrap_active = bool(
                self._bootstrap_state
                and self._bootstrap_state.get("status") in {"queued", "running"}
            )
        if bootstrap_active:
            self._update_bootstrap_state(
                run_id=run_id,
                status="running",
                stage="Classifying emails",
                message="Classifying the email corpus…",
            )
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

        # An email with an active category_override keeps that category on
        # every rerun (retry, full run, etc.) without re-invoking the
        # classifier - the override stands until a reviewer reverts it.
        overridden: dict[str, ClassificationDecision] = {}
        to_classify: list[dict[str, Any]] = []
        for email in emails:
            meta = self.store.get_email_meta(email["email_id"])
            override = meta.get("category_override") if meta else None
            if override:
                overridden[email["email_id"]] = ClassificationDecision(
                    category=EmailCategory(override),
                    decided_by="override",
                    confidence=Confidence.HIGH,
                    reason="Category manually overridden by a reviewer.",
                )
            else:
                to_classify.append(email)
        classified = classifier.classify_many(to_classify, max_workers=self.max_workers) if to_classify else []
        decision_by_email = dict(zip((email["email_id"] for email in to_classify), classified))
        decision_by_email.update(overridden)

        for processed_count, email in enumerate(emails, start=1):
            email_id = email["email_id"]
            decision = decision_by_email[email_id]
            self._record_email_meta(email_id, decision)
            try:
                result = self.process_email(email, run_id, category=decision.category)
                self.store.save_result(dump_model(result))
                sync_review_item(self.store, dump_model(result))
                clear_processing_failure(self.store, email_id)
                counters[result.category.value] += 1
                if result.status:
                    counters[result.status.value] += 1
                for stage_number in stage_counts:
                    stage_counts[stage_number] += 1
                classification_report[email_id] = self._classification_report_row(email, decision)
            except Exception as exc:
                logger.exception("Stage 1 failed for %s", email_id)
                failures.append({"email_id": email_id, "message": str(exc), "retryable": True})
                sync_processing_failure(self.store, email_id, str(exc))
            self._update_bootstrap_progress(
                run_id,
                processed_count,
                len(emails),
                "Processing emails",
                f"Processed {processed_count} of {len(emails)} emails.",
            )

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

    def _record_email_meta(self, email_id: str, decision: ClassificationDecision) -> None:
        meta = self.store.get_email_meta(email_id)
        changes: dict[str, Any] = {}
        if meta is None or meta.get("received_at") is None:
            changes["received_at"] = generate_received_at(email_id)
        if meta is None or meta.get("category_machine") is None:
            # Set once, from a real rules/llm decision - an override decision
            # must never overwrite the enduring "originally classified as X" label.
            if decision.decided_by != "override":
                changes["classification_method"] = "rules" if decision.decided_by == "rule" else "llm"
                changes["classification_reason"] = decision.reason
                changes["category_machine"] = decision.category.value
        if changes:
            self.store.upsert_email_meta(email_id, **changes)

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
        email = self._with_runtime_attachments(email)
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
        readable_count = sum(1 for parsed in parsed_documents if parsed.readable)
        if readable_count == 0:
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=[self.extract_document(parsed, None) for parsed in parsed_documents],
                document_reason=ReviewReason.UNREADABLE,
                notes=["None of the referenced attachments produced readable text."],
            )
        if len(parsed_documents) < 2:
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=[self.extract_document(parsed, None) for parsed in parsed_documents],
                document_reason=ReviewReason.MISSING_ATTACHMENT,
                notes=["Fewer than two usable attachments were available for the SI/BL pair."],
            )
        if readable_count < len(parsed_documents):
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=category,
                comparisons=[],
                documents=[self.extract_document(parsed, None) for parsed in parsed_documents],
                document_reason=ReviewReason.UNREADABLE,
                notes=["At least one referenced attachment could not be read as text or an image."],
            )
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

    def process_email_with_roles(
        self, email: dict[str, Any], run_id: str, si_path: str, bl_path: str
    ):
        """Reprocess one email with explicit SI/BL attachment roles, for the
        review queue's `wrong_doc_type` action: a reviewer overrides which
        attachment is which instead of trusting the detected document type."""

        email = self._with_runtime_attachments(email)
        email_id = email["email_id"]
        attachment_paths = email.get("attachments", [])
        if si_path not in attachment_paths or bl_path not in attachment_paths or si_path == bl_path:
            return decide_result(
                email_id=email_id,
                run_id=run_id,
                category=EmailCategory.BL_COMPARISON,
                comparisons=[],
                documents=[],
                document_reason=ReviewReason.WRONG_DOC_TYPE,
                notes=["The chosen SI/BL paths are not two distinct attachments on this email."],
            )
        si_document = self.extract_document(parse_attachment(self.loader, si_path), DocumentRole.SI)
        bl_document = self.extract_document(parse_attachment(self.loader, bl_path), DocumentRole.BL)
        comparisons = compare_documents(si_document, bl_document)
        return decide_result(
            email_id=email_id,
            run_id=run_id,
            category=EmailCategory.BL_COMPARISON,
            comparisons=comparisons,
            documents=[si_document, bl_document],
            notes=["SI/BL roles reassigned by a reviewer."],
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
            location = {key: value for key, value in locate_value(parsed, proposed).items() if key in _LOCATION_KEYS}
            field.evidence = FieldEvidence(
                snippet=f"Validated model value: {proposed}",
                quoted_text=proposed,
                source_path=parsed.path,
                **location,
            )
        return document
