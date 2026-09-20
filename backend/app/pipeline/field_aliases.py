"""Field-label aliases observed in the bundled attachment corpus.

These are label patterns, not value aliases. The patterns intentionally stay
small and explicit so an unrelated document label cannot become one of the
seven comparison fields by accident.
"""

from __future__ import annotations

from app.api.schemas.common import CanonicalField


# Keep this list limited to labels observed in data/attachments. CJK labels
# are included where the corpus uses them alongside the English labels.
FIELD_LABEL_ALIASES: dict[CanonicalField, tuple[str, ...]] = {
    CanonicalField.SHIPPER: (
        r"shipper(?:\s*/\s*exporter)?",
        r"发货人",
    ),
    CanonicalField.CONSIGNEE: (
        r"consignee(?:\s*\(\s*non-negotiable\s*\))?",
        r"to\s+the\s+order\s+of",
        r"收货人",
    ),
    CanonicalField.NOTIFY_PARTY: (
        r"notify(?:\s+party)?(?:\s*/\s*intermediate\s+consignee)?",
        r"通知人",
    ),
    CanonicalField.PORT_OF_LOADING: (
        r"port\s+of\s+loading(?:\s*\(\s*pol\s*\))?",
        r"load\s+port",
        r"\bpol\b",
        r"装货港",
    ),
    CanonicalField.PORT_OF_DISCHARGE: (
        r"port\s+of\s+discharge(?:\s*\(\s*pod\s*\))?",
        r"discharge\s+port",
        r"\bpod\b",
        r"卸货港",
    ),
    CanonicalField.CONTAINER_COUNT: (
        r"container\s+count",
        r"total\s+containers?",
        r"no\.?\s+of\s+containers?(?:\s+or\s+packages)?",
        r"箱数",
    ),
    CanonicalField.GROSS_WEIGHT_KG: (
        r"(?:total\s+)?gross\s+(?:weight|wt)[^|:=\-\d]*",
        r"毛重",
    ),
}
