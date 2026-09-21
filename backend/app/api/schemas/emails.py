from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from .common import (
    AttachmentMeta,
    CanonicalField,
    ComparisonStatus,
    EmailCategory,
    ResultRecord,
)


class EmailListItem(BaseModel):
    email_id: str
    display_id: str
    sender: str
    subject: str
    received_at: datetime | None = None
    attachments: list[AttachmentMeta] = Field(default_factory=list)
    category: EmailCategory | None = None
    category_machine: EmailCategory | None = None
    category_override: EmailCategory | None = None
    classification_method: str | None = None
    classification_reason: str | None = None
    status: ComparisonStatus | None = None
    review_reason: str | None = None
    defect_fields: list[CanonicalField] = Field(default_factory=list)
    attention: str | None = None


class EmailDetail(EmailListItem):
    body: str
    result: ResultRecord | None = None


class EmailListResponse(BaseModel):
    items: list[EmailListItem]
    total: int
    page: int = 1
    page_size: int = 50


class EmailQuery(BaseModel):
    status: str | None = None
    category: EmailCategory | None = None
    query: str | None = None
    page: int = 1
    page_size: int = 50
