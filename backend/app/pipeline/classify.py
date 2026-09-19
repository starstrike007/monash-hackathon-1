from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
import re
import threading
import unicodedata
from typing import Any, Iterable

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
    """Keep the current message and remove common email noise."""

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
            skipping_leading_disclaimer = True
            continue
        if signature_separator.match(stripped) or closing.match(stripped):
            break
        kept.append(line.rstrip())

    while kept and not kept[-1].strip():
        kept.pop()
    return "\n".join(kept).strip()


def _normalise(value: Any) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


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
    """Return a label only for a high-signal, deterministic match."""

    subject = str(email.get("subject", ""))
    body = strip_noise(str(email.get("body", "")))
    text = _normalise(f"{subject}\n{body}")
    attachment_names, filename_has_si, filename_has_bl = _attachment_metadata(email)
    attachment_pair = len(attachment_names) >= 2 and filename_has_si and filename_has_bl

    spam_signals = (
        "congratulations",
        "gift card",
        "selected for",
        "claim your prize",
        "avoid suspension",
        "avoid deactivation",
        "winner",
        "prize",
        "click here",
        "casino",
        "crypto investment",
        "lottery winner",
        "unsubscribe",
    )
    account_spam = (
        _has_any(text, ("verify your account", "mailbox has exceeded", "exceeded its storage"))
        and _has_any(text, ("deactivation", "suspension", "24 hours", "click"))
    )
    strong_spam = _has_any(text, spam_signals) or account_spam
    has_shipping_document = _has_any(
        text,
        ("shipping instruction", "bill of lading", "draft bl", "si and bl", "si/bl"),
    ) or bool(re.search(r"\b(?:si|bl)\b", text))
    if strong_spam and not has_shipping_document:
        return _RuleDecision(EmailCategory.SPAM)

    has_si_term = bool(re.search(r"\bsi\b", text)) or _has_any(
        text, ("shipping instruction", "shipping instructions")
    )
    has_bl_term = bool(re.search(r"\bbl\b", text)) or _has_any(
        text, ("bill of lading", "bills of lading", "draft bill of lading")
    )
    document_pair = (
        has_si_term
        and has_bl_term
        or bool(re.search(r"\bsi\s*(?:and|&|/)\s*(?:the\s+)?(?:draft\s+)?bl\b", text))
        or bool(re.search(r"\b(?:si|shipping instruction).*\b(?:bl|bill of lading)\b", text))
    )
    comparison_intent = _has_any(
        text,
        (
            "compare",
            "against",
            "verify",
            "verification",
            "check",
            "review",
            "reconcile",
            "discrepancy",
            "match",
            "matches",
        ),
    )
    document_confirmation = _has_any(
        text,
        (
            "confirm docs",
            "confirm documents",
            "confirm details",
            "confirm the details",
            "confirm the draft",
            "confirm the si",
            "confirm the bl",
            "confirm si",
            "confirm bl",
        ),
    )
    if (comparison_intent or document_confirmation) and (
        attachment_pair
        or (document_pair and _has_any(text, ("document", "docs", "details", "draft", "attached")))
    ):
        return _RuleDecision(EmailCategory.BL_COMPARISON)

    invoice_context = _has_any(
        text,
        (
            "invoice",
            "invoice number",
            "local charge",
            "local charges",
            "freight invoice",
            "billing",
            "remittance",
            "payable",
            "payment terms",
            "thc",
        ),
    )
    invoice_intent = _has_any(
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
            "cancel",
            "incorrect",
            "discrepancy",
            "duplicate",
            "void",
            "refund",
            "included",
            "separately",
            "billed",
        ),
    )
    if invoice_context and invoice_intent:
        return _RuleDecision(EmailCategory.INVOICE_QUERY)

    si_request_intent = _has_any(
        text,
        (
            "send",
            "provide",
            "request",
            "prepare",
            "complete",
            "submit",
            "share",
            "forward",
            "fill",
            "return",
            "need",
            "needed",
            "issue",
            "assist to send",
            "please find",
        ),
    )
    if has_si_term and si_request_intent and not comparison_intent:
        return _RuleDecision(EmailCategory.SI_REQUEST)

    # An isolated BL/SI mention, filename, or attachment count is not proof.
    return None


def _classification_context(email: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject": str(email.get("subject", "")),
        "body": strip_noise(str(email.get("body", "")))[:6000],
        "sender": str(email.get("from", email.get("sender", ""))),
        "attachments": email.get("attachments", []),
    }


def classification_cache_key(email: dict[str, Any]) -> str:
    """Hash normalized subject/body only; no sender or email ID is included."""

    subject = _normalise(email.get("subject", ""))
    body = _normalise(strip_noise(str(email.get("body", ""))))
    payload = f"{subject}\n{body}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class ClassificationService:
    """Rules-first Stage 1 classifier with bounded, deduplicated LLM calls."""

    def __init__(self, llm: Any | None = None, rules_only: bool = False) -> None:
        self.llm = llm
        self.rules_only = rules_only
        self._cache: dict[str, ClassificationDecision] = {}
        self._inflight: dict[str, Future[ClassificationDecision]] = {}
        self._lock = threading.RLock()
        self.llm_calls = 0
        self.cache_hits = 0
        self.failures = 0

    @property
    def metrics(self) -> dict[str, int | bool]:
        provider_attempts = int(getattr(self.llm, "request_attempts", 0) or 0)
        provider_retries = int(getattr(self.llm, "retry_count", 0) or 0)
        return {
            "rules_only": self.rules_only,
            "llm_calls": self.llm_calls,
            "provider_attempts": provider_attempts,
            "provider_retries": provider_retries,
            "cache_hits": self.cache_hits,
            "failures": self.failures,
        }

    def classify_many(
        self,
        emails: Iterable[dict[str, Any]],
        max_workers: int = 4,
    ) -> list[ClassificationDecision]:
        records = list(emails)
        if not records:
            return []
        workers = max(1, min(int(max_workers), len(records)))
        if workers == 1:
            return [self.classify(email) for email in records]
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="stage1") as pool:
            return list(pool.map(self.classify, records))

    def classify(self, email: dict[str, Any]) -> ClassificationDecision:
        rule_decision = _rule_classify(email)
        if rule_decision is not None:
            return ClassificationDecision(
                category=rule_decision.category,
                decided_by="rule",
                low_confidence=rule_decision.low_confidence,
            )

        if self.rules_only:
            return self._fallback("rules_only")
        if self.llm is None or not getattr(self.llm, "available", False):
            return self._fallback("model_unavailable")

        cache_key = classification_cache_key(email)
        owner = False
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self.cache_hits += 1
                return cached
            future = self._inflight.get(cache_key)
            if future is None:
                future = Future()
                self._inflight[cache_key] = future
                owner = True
            else:
                self.cache_hits += 1

        if not owner:
            return future.result()

        with self._lock:
            self.llm_calls += 1
        decision = self._call_llm(email)
        with self._lock:
            if decision.decided_by == "llm":
                self._cache[cache_key] = decision
            self._inflight.pop(cache_key, None)
            future.set_result(decision)
        return decision

    def _call_llm(self, email: dict[str, Any]) -> ClassificationDecision:
        try:
            candidate = self.llm.propose_classification(_classification_context(email))
        except Exception as exc:
            return self._fallback(f"model_exception:{type(exc).__name__}", model_failure=True)
        if candidate is None:
            return self._fallback("model_call_failed", model_failure=True)
        try:
            category = EmailCategory(candidate)
        except (TypeError, ValueError):
            return self._fallback("invalid_model_category", model_failure=True)
        return ClassificationDecision(category=category, decided_by="llm")

    def _fallback(self, reason: str, model_failure: bool = False) -> ClassificationDecision:
        if model_failure:
            with self._lock:
                self.failures += 1
        return ClassificationDecision(
            category=EmailCategory.GENERAL,
            decided_by="fallback_default",
            low_confidence=True,
            model_failure=model_failure,
            reason=reason,
        )


def classify_email_with_trace(
    email: dict[str, Any],
    llm: Any | None = None,
    rules_only: bool = False,
) -> ClassificationDecision:
    """Compatibility helper for one email."""

    return ClassificationService(llm, rules_only=rules_only).classify(email)


def classify_email(
    email: dict[str, Any],
    llm: Any | None = None,
    rules_only: bool = False,
) -> EmailCategory:
    """Compatibility wrapper returning only the five-value category."""

    return classify_email_with_trace(email, llm=llm, rules_only=rules_only).category
