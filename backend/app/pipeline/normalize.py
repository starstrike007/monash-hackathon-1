from __future__ import annotations

import re
import unicodedata
from decimal import Decimal, InvalidOperation

from app.api.schemas.common import CanonicalField, FieldExtraction


PORT_ALIASES = {
    "PORT KLANG": "MYPKG",
    "PORT KLANG WESTPORT": "MYPKG",
    "SHANGHAI": "CNSHA",
    "KARACHI": "PKKHI",
    "CALLAO": "PECLL",
    "NANTONG": "CNNTG",
    "SINGAPORE": "SGSIN",
}

# Keep the descriptive port identity as well as the UN/LOCODE.  The dataset
# contains adversarial-looking pairs where the code is the same but the
# printed city is different (for example Mombasa versus Tuticorin with KEMBA).
# A code-only identity would silently turn those real discrepancies into
# matches.  These aliases only collapse harmless spelling/terminal variants;
# an explicit conflicting city remains visible in the normalized value.
PORT_NAME_ALIASES = {
    "PORT KLANG WESTPORT": "PORT KLANG",
    "PORT KLANG": "PORT KLANG",
    "RUGAO NANTONG SHANGHAI": "RUGAO NANTONG SHANGHAI",
    "NHAVA SHEVA": "NHAVA SHEVA",
    "SINGAPORE": "SINGAPORE",
    "BUATAN": "BUATAN",
    "SHANGHAI": "SHANGHAI",
    "NANTONG": "NANTONG",
    "KARACHI": "KARACHI",
    "CALLAO": "CALLAO",
}

PORT_CANONICAL_CODES = {
    "PORT KLANG": "MYPKG",
    "RUGAO NANTONG SHANGHAI": "CNSHA",
    "NHAVA SHEVA": "INNSA",
    "SINGAPORE": "SGSIN",
    "BUATAN": "IDBUA",
    "SHANGHAI": "CNSHA",
    "NANTONG": "CNNTG",
    "KARACHI": "PKKHI",
    "CALLAO": "PECLL",
}


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).upper().strip()
    value = value.replace("&", " AND ")
    value = re.sub(r"[\.,;:/\\|]+", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def normalize_name(value: str) -> str:
    value = normalize_text(value)
    value = re.sub(r"\bCO\b", "COMPANY", value)
    value = re.sub(r"\bLTD\b", "LIMITED", value)
    value = re.sub(r"\bPTE\b", "PRIVATE", value)
    value = re.sub(r"\bSDN\b", "SENDIRIAN", value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_port(value: str) -> str:
    normalized = normalize_text(value)
    code_match = re.search(r"\(([A-Z]{5})\)", normalized)
    code = code_match.group(1) if code_match else None
    if not code:
        known_codes = set(PORT_CANONICAL_CODES.values())
        code = next(
            (candidate for candidate in known_codes if re.search(rf"\b{re.escape(candidate)}\b", normalized)),
            None,
        )
    name_text = re.sub(rf"\b{re.escape(code)}\b", " ", normalized) if code else normalized
    name_text = re.sub(r"[()]", " ", name_text)
    name_text = re.sub(r"\s+", " ", name_text).strip()

    name = name_text
    for alias, canonical in sorted(PORT_NAME_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        if alias in name_text:
            name = canonical
            break

    if not name and code:
        name = next((alias for alias, alias_code in PORT_CANONICAL_CODES.items() if alias_code == code), code)
    if not code and name in PORT_CANONICAL_CODES:
        code = PORT_CANONICAL_CODES[name]
    if not name:
        return code or normalized
    return f"{name}|{code}" if code else name


def normalize_container_count(value: str) -> str | None:
    match = re.search(r"\b(\d+)\s*[xX×]", value)
    if match:
        return str(int(match.group(1)))
    match = re.search(r"\b(\d+)\b", value)
    return str(int(match.group(1))) if match else None


def normalize_weight_kg(value: str) -> str | None:
    match = re.search(
        r"([-+]?\d[\d,\s]*(?:\.\d+)?)\s*(KG|KGS|KILOGRAMS?|G|GRAMS?|LB|LBS|POUNDS?)?\b",
        value,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    number = match.group(1).replace(",", "").replace(" ", "")
    try:
        amount = Decimal(number)
    except InvalidOperation:
        return None
    unit = (match.group(2) or "KG").upper()
    if unit in {"G", "GRAM", "GRAMS"}:
        amount /= Decimal("1000")
    elif unit in {"LB", "LBS", "POUND", "POUNDS"}:
        amount *= Decimal("0.45359237")
    return format(amount.normalize(), "f")


def normalize_field(field: CanonicalField, value: str) -> str | None:
    if field in {
        CanonicalField.SHIPPER,
        CanonicalField.CONSIGNEE,
        CanonicalField.NOTIFY_PARTY,
    }:
        return normalize_name(value)
    if field in {CanonicalField.PORT_OF_LOADING, CanonicalField.PORT_OF_DISCHARGE}:
        return normalize_port(value)
    if field == CanonicalField.CONTAINER_COUNT:
        return normalize_container_count(value)
    if field == CanonicalField.GROSS_WEIGHT_KG:
        return normalize_weight_kg(value)
    return normalize_text(value)


def normalize_extraction(extraction: FieldExtraction) -> FieldExtraction:
    if extraction.raw_value and extraction.state.value == "found":
        extraction.normalized_value = normalize_field(extraction.field_name, extraction.raw_value)
        if extraction.normalized_value is None:
            extraction.state = extraction.state.__class__.AMBIGUOUS
    return extraction
