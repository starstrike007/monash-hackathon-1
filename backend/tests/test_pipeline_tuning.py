from app.adapters.document_parsers import ParsedDocument
from app.api.schemas.common import CanonicalField, DocumentType, ExtractionState
from app.pipeline.extract import extract_document
from app.pipeline.normalize import normalize_port


def test_port_normalization_keeps_explicit_place_when_codes_conflict():
    assert normalize_port("Mombasa, Kenya (KEMBA)") != normalize_port("Tuticorin, India (KEMBA)")


def test_port_normalization_collapses_harmless_terminal_aliases():
    assert normalize_port("Port Klang, Malaysia (MYPKG)") == normalize_port("Port Klang (Westport) (MYPKG)")
    assert normalize_port("Singapore") == normalize_port("Singapore (SGSIN)")


def test_overlapping_compound_notify_label_uses_matching_address_context():
    parsed = ParsedDocument(
        path="bl.pdf",
        document_type=DocumentType.BILL_OF_LADING,
        text=(
            "BILL OF LADING\n"
            "Consignee CERIEX\n"
            "ZONE INDUSTRIELLE\n"
            "CONAKRY, GUINEA\n"
            "Notify Party/Intermediate ConsCigEnReIEeX\n"
            "ZONE INDUSTRIELLE\n"
            "CONAKRY, GUINEA\n"
            "POL: SINGAPORE (SGSIN)"
        ),
        lines=[
            "BILL OF LADING",
            "Consignee CERIEX",
            "ZONE INDUSTRIELLE",
            "CONAKRY, GUINEA",
            "Notify Party/Intermediate ConsCigEnReIEeX",
            "ZONE INDUSTRIELLE",
            "CONAKRY, GUINEA",
            "POL: SINGAPORE (SGSIN)",
        ],
        line_meta=[{"line": index + 1} for index in range(8)],
    )

    notify = next(field for field in extract_document(parsed).fields if field.field_name == CanonicalField.NOTIFY_PARTY)

    assert notify.state == ExtractionState.FOUND
    assert notify.raw_value == "CERIEX"


def test_overlapping_compound_notify_with_different_address_is_ambiguous():
    parsed = ParsedDocument(
        path="bl.pdf",
        document_type=DocumentType.BILL_OF_LADING,
        text=(
            "BILL OF LADING\n"
            "Consignee CERIEX\n"
            "CONAKRY, GUINEA\n"
            "Notify Party/Intermediate ConsBROKEN\n"
            "MOMBASA, KENYA\n"
            "POL: SINGAPORE (SGSIN)"
        ),
        lines=[
            "BILL OF LADING",
            "Consignee CERIEX",
            "CONAKRY, GUINEA",
            "Notify Party/Intermediate ConsBROKEN",
            "MOMBASA, KENYA",
            "POL: SINGAPORE (SGSIN)",
        ],
        line_meta=[{"line": index + 1} for index in range(6)],
    )

    notify = next(field for field in extract_document(parsed).fields if field.field_name == CanonicalField.NOTIFY_PARTY)

    assert notify.state == ExtractionState.AMBIGUOUS
