from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any

from backend.app.adapters.dataset_loader import DatasetLoader
from backend.app.adapters.document_parsers import parse_attachment
from backend.app.adapters.local_store import LocalStore
from backend.app.api.schemas.common import (
    AttachmentMeta,
    DocumentRole,
    DocumentType,
    EmailCategory,
    ReviewReason,
    dump_model,
)
from backend.app.api.schemas.pipeline import PipelineStageProgress
from backend.app.pipeline.classify import classify_email
from backend.app.pipeline.compare import compare_documents
from backend.app.pipeline.decide import decide_result
from backend.app.pipeline.extract import extract_document


STAGES = ((1, "Classify"), (2, "Extract & normalize"), (3, "Compare"), (4, "Decide"))


class PipelineOrchestrator:
    def __init__(self, loader: DatasetLoader, store: LocalStore) -> None:
        self.loader = loader
        self.store = store

    def ensure_seeded(self) -> None:
        if self.store.list_latest_results():
            return
        self.run()

    def run(self, email_ids: list[str] | None = None, retry_failed_only: bool = False) -> dict[str, Any]:
        emails = self.loader.list_emails()
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
        for email in emails:
            email_id = email["email_id"]
            try:
                result = self.process_email(email, run_id)
                self.store.save_result(dump_model(result))
                counters[result.category.value] += 1
                if result.status:
                    counters[result.status.value] += 1
                for stage_number in stage_counts:
                    stage_counts[stage_number] += 1
            except Exception as exc:
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
                    review_count=sum(1 for item in self.store.list_latest_results() if item.get("status") == "NEEDS_REVIEW"),
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
        return self.store.get_run(run_id) or run

    def process_email(self, email: dict[str, Any], run_id: str):
        email_id = email["email_id"]
        category = classify_email(email)
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
            documents.append(extract_document(parsed, role))

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
