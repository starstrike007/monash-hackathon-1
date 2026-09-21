from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.adapters.dataset_loader import DatasetLoader
    from app.adapters.local_store import LocalStore

KUALA_LUMPUR = timezone(timedelta(hours=8))
BUSINESS_START_HOUR = 9
BUSINESS_END_HOUR = 18
EARLIER_START_OFFSET = 30
EARLIER_EMAILS_PER_DAY = 32
EARLIER_END_OFFSET = 45
TIMESTAMP_ANCHOR_KEY = "timestamp_anchor_date"


def _anchor(now: datetime | None = None) -> datetime:
    value = now or datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(KUALA_LUMPUR)


def _sequence_number(email_id: str) -> int:
    """Return the numeric inbox sequence, with a stable fallback for fixtures."""

    match = re.search(r"(\d+)$", email_id)
    if match:
        return int(match.group(1))

    # Non-numbered fixture IDs remain deterministic and live in the older
    # bucket without affecting the ordered EM-0001...EM-0520 schedule.
    digest = hashlib.sha256(email_id.encode("utf-8")).digest()
    return 11 + int.from_bytes(digest[:4], "big") % 510


def _day_offset(sequence_number: int) -> int:
    if sequence_number <= 1:
        return 0
    if sequence_number <= 3:
        return 1
    if sequence_number <= 6:
        return sequence_number - 2  # 2, 3, 4 days ago
    if sequence_number <= 10:
        return sequence_number  # 7, 8, 9, 10 days ago

    older_rank = sequence_number - 11
    return min(
        EARLIER_START_OFFSET + older_rank // EARLIER_EMAILS_PER_DAY,
        EARLIER_END_OFFSET,
    )


def _clock_time(sequence_number: int, anchor: datetime) -> tuple[int, int, int]:
    """Choose business-hour times that preserve ascending email ID order."""

    if sequence_number == 1:
        # Keep the only Today email close to the current time while avoiding
        # a timestamp outside the business-hour display range.
        if anchor.hour < BUSINESS_START_HOUR:
            return BUSINESS_START_HOUR, 0, 0
        if anchor.hour >= BUSINESS_END_HOUR:
            return BUSINESS_END_HOUR - 1, 59, 59
        return anchor.hour, anchor.minute, anchor.second

    if sequence_number == 2:
        return BUSINESS_END_HOUR - 1, 59, 59
    if sequence_number == 3:
        return BUSINESS_END_HOUR - 1, 0, 0

    if sequence_number <= 10:
        return BUSINESS_END_HOUR - 1, 0, 0

    # Earlier contains multiple emails per day. Newer IDs receive the later
    # time so descending timestamp sorting still yields EM-0011 onward.
    slot = (sequence_number - 11) % EARLIER_EMAILS_PER_DAY
    seconds_from_midnight = (BUSINESS_END_HOUR - 1) * 3600 + 59 * 60 + 59 - slot * 60
    return (
        seconds_from_midnight // 3600,
        (seconds_from_midnight % 3600) // 60,
        seconds_from_midnight % 60,
    )


def generate_received_at(email_id: str, *, now: datetime | None = None) -> str:
    """Generate an ID-ordered simulated timestamp relative to the current day.

    The demo dataset has no real receipt times. Its display order is therefore
    intentional: EM-0001 is Today, EM-0002..0003 are Yesterday,
    EM-0004..0006 are This week, EM-0007..0010 are This month, and the
    remaining numbered emails are Earlier. The calendar anchor moves with the
    current Asia/Kuala_Lumpur date whenever timestamps are ensured or rebased.
    """

    anchor = _anchor(now)
    sequence_number = _sequence_number(email_id)
    target_date = (anchor - timedelta(days=_day_offset(sequence_number))).date()
    hour, minute, second = _clock_time(sequence_number, anchor)
    received_at = datetime(
        target_date.year,
        target_date.month,
        target_date.day,
        hour,
        minute,
        second,
        tzinfo=KUALA_LUMPUR,
    )
    return received_at.isoformat()


def rebase_timestamps(
    store: "LocalStore",
    loader: "DatasetLoader",
    *,
    now: datetime | None = None,
) -> int:
    """Regenerate every email relative to one current Kuala Lumpur date."""

    anchor = _anchor(now)
    anchor_date = anchor.date().isoformat()
    updated = 0
    for email in loader.list_emails():
        email_id = email["email_id"]
        store.upsert_email_meta(
            email_id,
            received_at=generate_received_at(email_id, now=anchor),
            **{TIMESTAMP_ANCHOR_KEY: anchor_date},
        )
        updated += 1
    return updated


def ensure_received_timestamps(
    store: "LocalStore",
    loader: "DatasetLoader",
    *,
    now: datetime | None = None,
) -> int:
    """Fill missing timestamps and automatically rebase them once per day."""

    anchor = _anchor(now)
    anchor_date = anchor.date().isoformat()
    updated = 0
    for email in loader.list_emails():
        email_id = email["email_id"]
        meta = store.get_email_meta(email_id) or {}
        if meta.get("received_at") is None or meta.get(TIMESTAMP_ANCHOR_KEY) != anchor_date:
            store.upsert_email_meta(
                email_id,
                received_at=generate_received_at(email_id, now=anchor),
                **{TIMESTAMP_ANCHOR_KEY: anchor_date},
            )
            updated += 1
    return updated
