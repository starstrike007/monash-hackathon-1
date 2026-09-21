from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
import hashlib
import json
import re
import threading
import time
import unicodedata
from typing import Any, Iterable

from app.adapters.openai_client import (
    ClassificationProposal,
    failure_reason_code,
    safe_exception_message,
)
from app.api.schemas.common import Confidence, EmailCategory
from app.pipeline.prompts import CLASSIFICATION_PROMPT, CLASSIFICATION_PROMPT_VERSION
from app.settings import settings


@dataclass(frozen=True)
class ClassificationDecision:
    category: EmailCategory
    decided_by: str
    confidence: Confidence = Confidence.LOW
    reason: str | None = None
    model_failure: bool = False
    failure_reason_code: str | None = None
    usage: dict[str, int] | None = None
    latency_seconds: float | None = None
    attempts: int | None = None
    exception_class: str | None = None
    exception_message: str | None = None

    @property
    def low_confidence(self) -> bool:
        """Compatibility view for callers that used the old boolean field."""

        return self.confidence == Confidence.LOW


@dataclass(frozen=True)
class _RuleDecision:
    category: EmailCategory
    confidence: Confidence = Confidence.HIGH
    reason: str = "Deterministic rules matched the main request."


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


def _rule_classify(
    email: dict[str, Any],
    *,
    draft_bl_request_rule_enabled: bool = True,
) -> _RuleDecision | None:
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
        # Keep the SI token boundary on both sides.  Without the trailing
        # boundary, booking numbers such as ``SIN832764835`` were read as the
        # standalone document token ``SI`` and draft-BL requests with no
        # comparison request were escalated as BL comparisons.
        or bool(re.search(r"\b(?:si\b|shipping instruction).*\b(?:bl|bill of lading)\b", text))
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
    explicit_comparison_intent = _has_any(
        text,
        (
            "compare",
            "against",
            "verify",
            "verification",
            "reconcile",
            "discrepancy",
            "match",
            "matches",
        ),
    ) or ("check" in text and has_si_term and has_bl_term)
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
    draft_bl_request = bool(
        re.search(
            r"\b(?:assist\s+to\s+)?(?:send|provide|share|forward)\b.{0,80}\bdraft\s+(?:bl|bill of lading)\b",
            text,
        )
    )
    if (
        draft_bl_request_rule_enabled
        and draft_bl_request
        and not attachment_pair
        and not explicit_comparison_intent
    ):
        return _RuleDecision(
            EmailCategory.GENERAL,
            reason="A draft BL was requested without an explicit SI/BL comparison request.",
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
    return classification_context(email)


def classification_context(email: dict[str, Any]) -> dict[str, Any]:
    return {
        "subject": str(email.get("subject", "")),
        "body": strip_noise(str(email.get("body", "")))[:6000],
        "sender": str(email.get("from", email.get("sender", ""))),
        "attachments": email.get("attachments", []),
    }


def classification_cache_key(
    email: dict[str, Any],
    model_id: str = "",
    prompt_version: str = CLASSIFICATION_PROMPT_VERSION,
) -> str:
    """Hash input plus model and prompt identity; sender and email ID are excluded."""

    subject = _normalise(email.get("subject", ""))
    body = _normalise(strip_noise(str(email.get("body", ""))))
    attachments = email.get("attachments", []) or []
    payload = {
        "model_id": str(model_id),
        "prompt_version": str(prompt_version),
        "prompt_fingerprint": hashlib.sha256(CLASSIFICATION_PROMPT.encode("utf-8")).hexdigest(),
        "subject": subject,
        "body": body,
        "attachments": attachments,
    }
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _safe_reason(value: Any, fallback: str) -> str:
    words = str(value or "").split()
    if not words:
        return fallback
    return " ".join(words[:20])


class ClassificationService:
    """Rules-first Stage 1 classifier with bounded, deduplicated LLM calls."""

    def __init__(
        self,
        llm: Any | None = None,
        rules_only: bool = False,
        draft_bl_request_rule_enabled: bool | None = None,
    ) -> None:
        self.llm = llm
        self.rules_only = rules_only
        self.draft_bl_request_rule_enabled = (
            settings.draft_bl_request_rule_enabled
            if draft_bl_request_rule_enabled is None
            else bool(draft_bl_request_rule_enabled)
        )
        self._cache: dict[str, ClassificationDecision] = {}
        self._inflight: dict[str, Future[ClassificationDecision]] = {}
        self._lock = threading.RLock()
        self.llm_calls = 0
        self.cache_hits = 0
        self.failures = 0
        self._usage_totals = {
            "input_tokens": 0,
            "output_tokens": 0,
            "reasoning_tokens": 0,
        }
        self._latency_seconds = 0.0
        self._failure_reason_counts: dict[str, int] = {}

    @property
    def metrics(self) -> dict[str, Any]:
        provider_attempts = int(getattr(self.llm, "request_attempts", 0) or 0)
        provider_retries = int(getattr(self.llm, "retry_count", 0) or 0)
        with self._lock:
            usage_totals = dict(self._usage_totals)
            latency_seconds = round(self._latency_seconds, 6)
            failure_reason_counts = dict(self._failure_reason_counts)
        return {
            "rules_only": self.rules_only,
            "draft_bl_request_rule_enabled": self.draft_bl_request_rule_enabled,
            "llm_calls": self.llm_calls,
            "provider_attempts": provider_attempts,
            "provider_retries": provider_retries,
            "cache_hits": self.cache_hits,
            "failures": self.failures,
            "llm_input_tokens": usage_totals["input_tokens"],
            "llm_output_tokens": usage_totals["output_tokens"],
            "llm_reasoning_tokens": usage_totals["reasoning_tokens"],
            "llm_latency_seconds": latency_seconds,
            "llm_usage_totals": usage_totals,
            "failure_reason_counts": failure_reason_counts,
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
        rule_decision = _rule_classify(
            email,
            draft_bl_request_rule_enabled=self.draft_bl_request_rule_enabled,
        )
        if rule_decision is not None:
            return ClassificationDecision(
                category=rule_decision.category,
                decided_by="rule",
                confidence=rule_decision.confidence,
                reason=rule_decision.reason,
            )

        if self.rules_only:
            return self._fallback("rules_only")
        if self.llm is None or not getattr(self.llm, "available", False):
            failure_code = getattr(self.llm, "unavailable_failure_reason_code", None) or "llm_no_key"
            return self._fallback(
                failure_code,
                model_failure=True,
                failure_reason_code=failure_code,
                exception_class=getattr(self.llm, "unavailable_exception_class", None),
                exception_message=getattr(self.llm, "unavailable_exception_message", None),
            )

        cache_key = classification_cache_key(email, model_id=str(getattr(self.llm, "model", "")))
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

    def _record_call_metrics(
        self,
        usage: Any,
        latency_seconds: Any,
    ) -> None:
        with self._lock:
            if isinstance(usage, dict):
                for key in self._usage_totals:
                    try:
                        self._usage_totals[key] += max(0, int(usage.get(key, 0) or 0))
                    except (TypeError, ValueError):
                        continue
            try:
                self._latency_seconds += max(0.0, float(latency_seconds or 0.0))
            except (TypeError, ValueError):
                pass

    def _call_llm(self, email: dict[str, Any]) -> ClassificationDecision:
        started = time.perf_counter()
        try:
            traced_call = getattr(self.llm, "propose_classification_result", None)
            if callable(traced_call):
                result = traced_call(classification_context(email))
            else:
                result = self.llm.propose_classification(_classification_context(email))
        except Exception as exc:
            latency_seconds = time.perf_counter() - started
            reason_code = failure_reason_code(exc)
            self._record_call_metrics(None, latency_seconds)
            return self._fallback(
                reason_code,
                model_failure=True,
                failure_reason_code=reason_code,
                attempts=1,
                exception_class=type(exc).__name__,
                exception_message=safe_exception_message(exc),
                latency_seconds=latency_seconds,
            )

        usage = getattr(result, "usage", None)
        reported_latency = getattr(result, "latency_seconds", None)
        latency_seconds = (
            reported_latency
            if isinstance(reported_latency, (int, float))
            else time.perf_counter() - started
        )
        self._record_call_metrics(usage, latency_seconds)
        result_failure_code = getattr(result, "failure_reason_code", None)
        result_attempts = getattr(result, "attempts", None)
        result_exception_class = getattr(result, "exception_class", None)
        result_exception_message = getattr(result, "exception_message", None)
        proposal = getattr(result, "proposal", result)

        if isinstance(proposal, dict):
            try:
                proposal = ClassificationProposal.model_validate(proposal)
            except Exception:
                proposal = None

        if isinstance(proposal, ClassificationProposal):
            try:
                category = EmailCategory(proposal.category)
                confidence = Confidence(proposal.confidence)
            except (TypeError, ValueError):
                category = None
                confidence = None
            if category is not None and confidence is not None:
                return ClassificationDecision(
                    category=category,
                    decided_by="llm",
                    confidence=confidence,
                    reason=_safe_reason(proposal.reason, "Model classified the main request."),
                    usage=usage if isinstance(usage, dict) else None,
                    latency_seconds=float(latency_seconds),
                )

        # Keep compatibility with lightweight test doubles and older adapter users
        # that still return only a category string.
        candidate = proposal if isinstance(proposal, str) else None
        if candidate is not None:
            try:
                category = EmailCategory(candidate)
            except (TypeError, ValueError):
                category = None
            if category is not None:
                return ClassificationDecision(
                    category=category,
                    decided_by="llm",
                    confidence=Confidence.MEDIUM,
                    reason="Model returned the requested category.",
                    usage=usage if isinstance(usage, dict) else None,
                    latency_seconds=float(latency_seconds),
                )

        reason_code = result_failure_code or "llm_error"
        return self._fallback(
            reason_code,
            model_failure=True,
            failure_reason_code=reason_code,
            attempts=result_attempts,
            exception_class=result_exception_class,
            exception_message=result_exception_message,
            usage=usage if isinstance(usage, dict) else None,
            latency_seconds=float(latency_seconds),
        )

    def _fallback(
        self,
        reason: str,
        model_failure: bool = False,
        failure_reason_code: str | None = None,
        attempts: int | None = None,
        exception_class: str | None = None,
        exception_message: str | None = None,
        usage: dict[str, int] | None = None,
        latency_seconds: float | None = None,
    ) -> ClassificationDecision:
        if model_failure:
            with self._lock:
                self.failures += 1
                if failure_reason_code:
                    self._failure_reason_counts[failure_reason_code] = (
                        self._failure_reason_counts.get(failure_reason_code, 0) + 1
                    )
        return ClassificationDecision(
            category=EmailCategory.GENERAL,
            decided_by="fallback_default",
            confidence=Confidence.LOW,
            model_failure=model_failure,
            failure_reason_code=failure_reason_code,
            attempts=attempts,
            exception_class=exception_class,
            exception_message=exception_message,
            reason=_safe_reason(reason, "Unable to determine the main request."),
            usage=usage,
            latency_seconds=latency_seconds,
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
