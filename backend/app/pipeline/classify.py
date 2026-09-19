from __future__ import annotations

import re
from typing import Any

from backend.app.api.schemas.common import EmailCategory


def strip_noise(body: str) -> str:
    cleaned = re.split(r"\n\s*(?:best regards|kind regards|thanks|regards)[, ]", body, maxsplit=1, flags=re.I)[0]
    cleaned = re.split(r"\n\s*(?:from|sent|to|subject):", cleaned, maxsplit=1, flags=re.I)[0]
    return cleaned.strip()


def classify_email(email: dict[str, Any]) -> EmailCategory:
    subject = str(email.get("subject", ""))
    body = strip_noise(str(email.get("body", "")))
    text = f"{subject}\n{body}".lower()
    attachments = " ".join(str(path).lower() for path in email.get("attachments", []))

    spam_signals = (
        "congratulations",
        "gift card",
        "selected for",
        "claim your",
        "avoid suspension",
        "winner",
        "prize",
        "click here",
    )
    if any(signal in text for signal in spam_signals):
        return EmailCategory.SPAM

    invoice_signals = ("invoice", "payment terms", "remittance", "billing", "payable")
    if any(signal in text for signal in invoice_signals):
        return EmailCategory.INVOICE_QUERY

    compare_signals = (
        "compare",
        "against",
        "verify",
        "verification",
        "check the details",
        "check details",
        "please confirm",
        "confirm the",
        "review the draft",
    )
    document_signals = ("shipping instruction", "draft bl", "bill of lading", r"\bsi\b", r"\bbl\b")
    has_compare_intent = any(signal in text for signal in compare_signals)
    has_documents = any(re.search(signal, text) for signal in document_signals) or bool(attachments)
    if has_compare_intent and has_documents:
        return EmailCategory.BL_COMPARISON

    si_request_signals = ("shipping instruction", "send si", "si request", "please find si")
    if any(signal in text for signal in si_request_signals):
        return EmailCategory.SI_REQUEST

    return EmailCategory.GENERAL
