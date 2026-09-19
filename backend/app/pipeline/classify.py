from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata
from typing import Any

from app.api.schemas.common import EmailCategory


@dataclass(frozen=True)
class ClassificationDecision:
    category: EmailCategory
    decided_by: str
    low_confidence: bool = False
    model_failure: bool = False
    reason: str | None = None


@dataclass(frozen=True)
class _RuleDecision:
    category: EmailCategory
    low_confidence: bool = False


def strip_noise(body: str) -> str:
    """Keep the current message and remove common email noise.

    This is deliberately line-oriented. A phrase such as ``regards`` inside
    the message must not remove the remainder of the email, while a closing
    line, quoted reply header, or legal footer should stop further scanning.
    """

    lines = body.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    kept: list[str] = []
    closing = re.compile(
        r"^\s*(?:best|kind|warm)?\s*(?:regards|thanks|thank you|sincerely|cheers)[,!:. ]*$",
        re.IGNORECASE,
    )
    reply_header = re.compile(
        r"^\s*(?:from|sent|to|cc|bcc|subject):\s*.+$|"
        r"^\s*(?:on .+ wrote:|[-_ ]*original message[-_ ]*)\s*$",
        re.IGNORECASE,
    )
    signature_separator = re.compile(r"^\s*(?:--+|__{3,}|_{3,})\s*$")
    disclaimer = re.compile(
        r"^\s*(?:warning:\s*this email|this email and any (?:files|attachments)|"
        r"confidential(?:ity)?\s+(?:notice|disclaimer)|disclaimer:|"
        r"please consider the environment|if you are not the intended recipient)",
        re.IGNORECASE,
    )

    skipping_leading_disclaimer = False
    for line in lines:
        stripped = line.strip()
        if skipping_leading_disclaimer:
            if not stripped:
                skipping_leading_disclaimer = False
            continue
        if stripped.startswith(">") or reply_header.match(stripped):
            break
        if disclaimer.match(stripped):
            if kept:
                break
            # Security banners are sometimes prepended to the message. Skip
            # that banner until its blank separator, then resume.
            skipping_leading_disclaimer = True
            continue
        if signature_separator.match(stripped) or closing.match(stripped):
            break
        kept.append(line.rstrip())

    while kept and not kept[-1].strip():
        kept.pop()
    return "\n".join(kept).strip()


def _normalise(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).casefold()


def _has_any(text: str, signals: tuple[str, ...]) -> bool:
    return any(signal in text for signal in signals)


def _attachment_metadata(email: dict[str, Any]) -> tuple[list[str], bool, bool]:
    names: list[str] = []
    for attachment in email.get("attachments") or []:
        if isinstance(attachment, dict):
            value = attachment.get("filename") or attachment.get("path") or ""
        else:
            value = attachment
        names.append(_normalise(value))
    joined = " ".join(names)
    has_si = bool(re.search(r"(?:^|[_/ .-])si(?:[._ -]|$)", joined))
    has_bl = bool(re.search(r"(?:^|[_/ .-])bl(?:[._ -]|$)", joined))
    return names, has_si, has_bl


def _rule_classify(email: dict[str, Any]) -> _RuleDecision | None:
    subject = str(email.get("subject", ""))
    body = strip_noise(str(email.get("body", "")))
    text = _normalise(f"{subject}\n{body}")
    attachment_names, filename_has_si, filename_has_bl = _attachment_metadata(email)
    attachment_count = len(attachment_names)

    spam_signals = (
        "congratulations",
        "gift card",
        "selected for",
        "claim your",
        "avoid suspension",
        "winner",
        "prize",
        "click here",
        "casino",
        "crypto investment",
    )
    strong_spam = _has_any(text, spam_signals)
    if strong_spam and not _has_any(
        text, ("shipping instruction", "bill of lading", "draft bl", "si and bl")
    ):
        return _RuleDecision(EmailCategory.SPAM)

    has_si_term = bool(re.search(r"\bsi\b", text)) or "shipping instruction" in text
    has_bl_term = bool(re.search(r"\bbl\b", text)) or "bill of lading" in text
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
    ) or has_si_term or has_bl_term

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
        "matches the",
        "match the",
    )
    explicit_pair_language = _has_any(
        text,
        (
            "si and draft bl",
            "si and the draft bl",
            "compare the si",
            "compare si",
            "si against the bl",
            "bl against the si",
            "si matches bl",
            "bl matches si",
            "si and bl",
        ),
    )
    attachment_pair = attachment_count >= 2 and filename_has_si and filename_has_bl
    explicit_comparison = (
        explicit_pair_language
        and _has_any(text, compare_signals)
        or (
            _has_any(text, compare_signals)
            and has_shipping_context
            and has_si_term
            and has_bl_term
        )
    )
    attachment_confirmation = attachment_pair and _has_any(
        text,
        ("check", "confirm", "verify", "checking", "review", "revert with"),
    )
    if explicit_comparison or attachment_confirmation:
        return _RuleDecision(EmailCategory.BL_COMPARISON)

    invoice_signals = (
        "invoice query",
        "query on invoice",
        "invoice discrepancy",
        "payment terms",
        "remittance",
        "billing question",
        "billing issue",
        "payable",
    )
    invoice_word_is_query = "invoice" in text and _has_any(
        text,
        (
            "query",
            "question",
            "clarify",
            "breakdown",
            "charge",
            "payment",
            "advise",
            "confirm",
        ),
    )
    if (_has_any(text, invoice_signals) or invoice_word_is_query) and not explicit_comparison:
        return _RuleDecision(EmailCategory.INVOICE_QUERY)

    si_request_signals = (
        "shipping instruction",
        "send si",
        "si request",
        "please find si",
        "request si",
        "si needed",
        "provide the si",
        "send the si",
        "complete the si",
    )
    if _has_any(text, si_request_signals):
        return _RuleDecision(EmailCategory.SI_REQUEST)

    # A filename or an isolated BL/SI mention is intentionally insufficient.
    # Leave the case unresolved for the model or the deterministic GENERAL sink.
    return None


def _classification_context(email: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject": str(email.get("subject", "")),
        "body": strip_noise(str(email.get("body", "")))[:6000],
        "sender": str(email.get("from", email.get("sender", ""))),
        "attachments": email.get("attachments", []),
    }


def classify_email_with_trace(
    email: dict[str, Any],
    llm: Any | None = None,
) -> ClassificationDecision:
    """Run the Stage 1 rule pass and, only if unresolved, the LLM fallback."""

    rule_decision = _rule_classify(email)
    if rule_decision is not None:
        return ClassificationDecision(
            category=rule_decision.category,
            decided_by="rules",
            low_confidence=rule_decision.low_confidence,
        )

    if llm is not None and getattr(llm, "available", False):
        try:
            candidate = llm.propose_classification(_classification_context(email))
        except Exception as exc:
            return ClassificationDecision(
                category=EmailCategory.GENERAL,
                decided_by="fallback",
                low_confidence=True,
                model_failure=True,
                reason=f"model_exception:{type(exc).__name__}",
            )

        if getattr(llm, "last_call_failed", False):
            return ClassificationDecision(
                category=EmailCategory.GENERAL,
                decided_by="fallback",
                low_confidence=True,
                model_failure=True,
                reason="model_call_failed",
            )
        try:
            category = EmailCategory(candidate)
        except (TypeError, ValueError):
            return ClassificationDecision(
                category=EmailCategory.GENERAL,
                decided_by="fallback",
                low_confidence=True,
                model_failure=True,
                reason="invalid_model_category",
            )
        return ClassificationDecision(category=category, decided_by="llm")

    return ClassificationDecision(
        category=EmailCategory.GENERAL,
        decided_by="fallback",
        low_confidence=True,
        reason="model_unavailable",
    )


def classify_email(email: dict[str, Any], llm: Any | None = None) -> EmailCategory:
    """Compatibility wrapper returning only the five-value category."""

    return classify_email_with_trace(email, llm).category
