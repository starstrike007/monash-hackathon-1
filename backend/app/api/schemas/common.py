from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EmailCategory(str, Enum):
    BL_COMPARISON = "BL_COMPARISON"
    SI_REQUEST = "SI_REQUEST"
    INVOICE_QUERY = "INVOICE_QUERY"
    GENERAL = "GENERAL"
    SPAM = "SPAM"


class ComparisonStatus(str, Enum):
    OK = "OK"
    MISMATCH = "MISMATCH"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class ReviewReason(str, Enum):
    WRONG_DOC_TYPE = "wrong_doc_type"
    MISSING_ATTACHMENT = "missing_attachment"
    UNREADABLE = "unreadable"
    MISSING_VALUE = "missing_value"


class CanonicalField(str, Enum):
    SHIPPER = "shipper"
    CONSIGNEE = "consignee"
    NOTIFY_PARTY = "notify_party"
    PORT_OF_LOADING = "port_of_loading"
    PORT_OF_DISCHARGE = "port_of_discharge"
    CONTAINER_COUNT = "container_count"
    GROSS_WEIGHT_KG = "gross_weight_kg"


class DocumentType(str, Enum):
    SHIPPING_INSTRUCTION = "Shipping Instruction"
    BILL_OF_LADING = "Bill of Lading"
    COMMERCIAL_INVOICE = "Commercial Invoice"
    PACKING_LIST = "Packing List"
    CERTIFICATE_OF_ORIGIN = "Certificate of Origin"
    UNKNOWN = "Unknown"
    UNREADABLE = "Unreadable"


class DocumentRole(str, Enum):
    SI = "SI"
    BL = "BL"


class ExtractionState(str, Enum):
    FOUND = "found"
    MISSING = "missing"
    PLACEHOLDER = "placeholder"
    AMBIGUOUS = "ambiguous"
    UNREADABLE = "unreadable"


class ExtractionSource(str, Enum):
    RULE = "rule"
    LLM = "llm"
    VISION = "vision"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class PipelineRunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


class PipelineStageStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    PARTIAL = "partial"
    FAILED = "failed"


class ReviewAction(str, Enum):
    CONFIRM = "confirm"
    CORRECT = "correct"


class AttachmentMeta(BaseModel):
    path: str
    filename: str
    extension: str
    size_bytes: int | None = None


class FieldEvidence(BaseModel):
    snippet: str = ""
    page: int | None = None
    sheet: str | None = None
    cell: str | None = None
    source_path: str | None = None


class FieldExtraction(BaseModel):
    field_name: CanonicalField
    state: ExtractionState
    raw_value: str | None = None
    normalized_value: str | None = None
    source: ExtractionSource | None = None
    confidence: Confidence | None = None
    evidence: FieldEvidence | None = None

    @property
    def present(self) -> bool:
        return self.state == ExtractionState.FOUND


class DocumentExtraction(BaseModel):
    role: DocumentRole | None = None
    path: str
    document_type: DocumentType
    readable: bool
    text_preview: str = ""
    table_rows: list[list[str]] = Field(default_factory=list)
    locations: list[dict[str, Any]] = Field(default_factory=list)
    fields: list[FieldExtraction] = Field(default_factory=list)


class FieldComparison(BaseModel):
    field_name: CanonicalField
    si: FieldExtraction | None = None
    bl: FieldExtraction | None = None
    state: str
    result: str
    evidence: list[FieldEvidence] = Field(default_factory=list)


class ResultRecord(BaseModel):
    email_id: str
    run_id: str | None = None
    category: EmailCategory
    status: ComparisonStatus | None = None
    review_reason: ReviewReason | None = None
    has_defect: bool | None = None
    defect_fields: list[CanonicalField] = Field(default_factory=list)
    skipped_fields: list[CanonicalField] = Field(default_factory=list)
    selected_si_path: str | None = None
    selected_bl_path: str | None = None
    version: int = 1
    comparisons: list[FieldComparison] = Field(default_factory=list)
    documents: list[DocumentExtraction] = Field(default_factory=list)
    decision_notes: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class SubmissionRow(BaseModel):
    category: EmailCategory
    status: ComparisonStatus
    review_reason: ReviewReason | None = None
    defect_fields: list[CanonicalField] = Field(default_factory=list)
    has_defect: bool = False


def dump_model(value: BaseModel | Any) -> dict[str, Any]:
    """Support both Pydantic v2 and the older v1 API in local environments."""
    if isinstance(value, BaseModel):
        if hasattr(value, "model_dump"):
            return value.model_dump(mode="json")
        return value.dict()
    return value


def decimal_to_string(value: Decimal | None) -> str | None:
    return None if value is None else format(value.normalize(), "f")
