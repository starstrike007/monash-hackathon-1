from __future__ import annotations

import re
from typing import Any

from backend.app.api.schemas.common import EmailCategory


def strip_noise(body: str) -> str:
    cleaned = re.split(r"\n\s*(?:best regards|kind regards|thanks|regards)[, ]", body, maxsplit=1, flags=re.I)[0]
    cleaned = re.split(r"\n\s*(?:from|sent|to|subject):", cleaned, maxsplit=1, flags=re.I)[0]
    return cleaned.strip()


def _has_any(text: str, signals: tuple[str, ...]) -> bool:
    return any(signal in text for signal in signals)


def classify_email(email: dict[str, Any]) -> EmailCategory:
    subject = str(email.get("subject", ""))
    body = strip_noise(str(email.get("body", "")))
    text = f"{subject}\n{body}".lower()
    attachments = [str(path).lower() for path in (email.get("attachments") or [])]
    attachment_names = " ".join(attachments)
    has_attachments = bool(attachments)

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
    if _has_any(text, spam_signals):
        return EmailCategory.SPAM

    # Filenames are only a supporting signal. They become useful here because the
    # email body/subject must also express a checking or document intent.
    attachment_doc_context = bool(re.search(r"(?:^|[_/ .-])(si|bl)(?:[._ -]|$)", attachment_names))
    has_shipping_context = _has_any(
        text,
        (
            "shipping instruction",
            "draft bl",
            "bill of lading",
            "si and bl",
            "si/bl",
            "bl against the si",
            "si against the bl",
        ),
    ) or bool(re.search(r"\b(?:si|bl)\b", text)) or attachment_doc_context

    # Comparison intent is deliberately checked before invoice language. Some
    # document requests mention an invoice as part of the shipment context.
    compare_signals = (
        "compare",
        "against",
        "verify",
        "verification",
        "check the details",
        "check details",
        "check the draft",
        "please confirm",
        "confirm the",
        "to confirm docs",
        "review the draft",
        "for checking",
        "checking asap",
        "discrepancy",
    )
    explicit_pair_language = _has_any(
        text,
        (
            "si and draft bl",
            "compare the si",
            "compare si",
            "si against the bl",
            "bl against the si",
        ),
    )
    if _has_any(text, compare_signals) and (
        (has_attachments and has_shipping_context) or explicit_pair_language
    ):
        return EmailCategory.BL_COMPARISON

    invoice_signals = (
        "invoice query",
        "query on invoice",
        "payment terms",
        "remittance",
        "billing",
        "payable",
    )
    invoice_word_is_query = "invoice" in text and _has_any(
        text,
        ("query", "question", "clarify", "breakdown", "charge", "payment"),
    )
    if (_has_any(text, invoice_signals) or invoice_word_is_query) and not has_shipping_context:
        return EmailCategory.INVOICE_QUERY

    si_request_signals = (
        "shipping instruction",
        "send si",
        "si request",
        "please find si",
        "request si",
        "si needed",
    )
    if _has_any(text, si_request_signals):
        return EmailCategory.SI_REQUEST

    return EmailCategory.GENERAL
