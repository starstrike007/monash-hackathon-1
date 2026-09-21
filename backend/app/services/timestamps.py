from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.adapters.dataset_loader import DatasetLoader
    from app.adapters.local_store import LocalStore

KUALA_LUMPUR = timezone(timedelta(hours=8))
LOOKBACK_DAYS = 45
BUSINESS_START_HOUR = 9
BUSINESS_END_HOUR = 18


def _hash_fractions(email_id: str, count: int) -> list[float]:
    digest = hashlib.sha256(email_id.encode("utf-8")).digest()
    fractions = []
    for index in range(count):
        chunk = digest[index * 4 : (index + 1) * 4]
        value = int.from_bytes(chunk, "big")
        fractions.append(value / 0xFFFFFFFF)
    return fractions


def generate_received_at(email_id: str, *, now: datetime | None = None) -> str:
    """Deterministic 'received' timestamp for a demo dataset with no real ones.

    Derived from a hash of `email_id` so the same email always gets the same
    timestamp until explicitly rebased. Spread over the last ~45 days,
    weighted toward recent days (so Today/Yesterday/This week/This month/
    Earlier are all populated), within Asia/Kuala_Lumpur business hours.
    """

    anchor = (now or datetime.now(timezone.utc)).astimezone(KUALA_LUMPUR)
    day_fraction, hour_fraction, minute_fraction, second_fraction = _hash_fractions(email_id, 4)
    day_offset = int((1 - day_fraction) ** 2.5 * LOOKBACK_DAYS)
    hour_span = BUSINESS_END_HOUR - BUSINESS_START_HOUR
    hour = BUSINESS_START_HOUR + int(hour_fraction * hour_span)
    minute = int(minute_fraction * 60)
    second = int(second_fraction * 60) % 60
    target_date = (anchor - timedelta(days=day_offset)).date()
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


def rebase_timestamps(store: "LocalStore", loader: "DatasetLoader", *, now: datetime | None = None) -> int:
    """Regenerate every email's received_at relative to `now` so the demo can
    be re-anchored right before a presentation. Returns the number updated."""

    updated = 0
    for email in loader.list_emails():
        email_id = email["email_id"]
        store.upsert_email_meta(email_id, received_at=generate_received_at(email_id, now=now))
        updated += 1
    return updated


def ensure_received_timestamps(store: "LocalStore", loader: "DatasetLoader") -> int:
    """Persist missing demo timestamps without changing existing values."""

    updated = 0
    for email in loader.list_emails():
        meta = store.get_email_meta(email["email_id"]) or {}
        if meta.get("received_at") is None:
            store.upsert_email_meta(email["email_id"], received_at=generate_received_at(email["email_id"]))
            updated += 1
    return updated
