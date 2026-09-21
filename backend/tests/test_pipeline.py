import pytest

from app.api.schemas.common import (
    CanonicalField,
    ComparisonStatus,
    DocumentRole,
    DocumentType,
    EmailCategory,
    ExtractionSource,
    ExtractionState,
    FieldEvidence,
    FieldExtraction,
)
from app.adapters.document_parsers import ParsedDocument, detect_document_type
from app.pipeline.classify import ClassificationService, classify_email
from app.pipeline.compare import compare_documents
from app.pipeline.decide import decide_result
from app.pipeline.extract import extract_document


def test_classifier_keeps_a_draft_bl_request_without_compare_intent_general():
    email = {
        "subject": "Draft BL for approval",
        "body": "Please send the draft BL when ready.",
        "attachments": [],
    }
    assert classify_email(email) == EmailCategory.GENERAL


def test_classifier_handles_spam_and_invoice():
    assert classify_email({"subject": "You won a gift card", "body": "Click here", "attachments": []}) == EmailCategory.SPAM
    assert classify_email({"subject": "Invoice query", "body": "Please confirm payment terms", "attachments": []}) == EmailCategory.INVOICE_QUERY


def test_classifier_requires_comparison_language_for_draft_bl_without_attachments():
    assert classify_email(
        {
            "subject": "Draft BL MMSS 2507",
            "body": "Please assist to send the draft BL when ready.",
            "attachments": [],
        }
    ) == EmailCategory.GENERAL
    assert classify_email(
        {
            "subject": "To confirm docs",
            "body": "Please compare the SI and draft BL and confirm. Attachments were dropped.",
            "attachments": [],
        }
    ) == EmailCategory.BL_COMPARISON


def test_classifier_does_not_treat_si_booking_prefix_as_document_term():
    assert classify_email(
        {
            "subject": "RE: TO CONFIRM DOCS 5AAT-03056 SIN525534192",
            "body": "Please assist to send the draft BL for SIN832764835 for checking asap.",
            "attachments": [],
        }
    ) == EmailCategory.GENERAL

    assert classify_email(
        {
            "subject": "TO CONFIRM DOCS 5AAT-03056",
            "body": "Please assist to send the draft BL for SIN832764835 for checking asap.",
            "attachments": [],
        }
    ) == EmailCategory.GENERAL


def test_classifier_keeps_explicit_compare_request_with_dropped_attachments():
    assert classify_email(
        {
            "subject": "AFRT - LONG BEACH - draft documents",
            "body": "Please compare the SI and draft BL and confirm; attachments appear to have been dropped.",
            "attachments": [],
        }
    ) == EmailCategory.BL_COMPARISON


def test_draft_bl_request_rule_flag_routes_unresolved_request_to_fallback_or_llm():
    email = {
        "subject": "Draft document requested",
        "body": "Please provide the draft BL when it is ready.",
        "attachments": [],
    }

    enabled = ClassificationService(
        rules_only=True,
        draft_bl_request_rule_enabled=True,
    ).classify(email)
    disabled_rules_only = ClassificationService(
        rules_only=True,
        draft_bl_request_rule_enabled=False,
    ).classify(email)

    class FakeLlm:
        available = True
        model = "synthetic-model"

        def propose_classification(self, context):
            return "GENERAL"

    disabled_with_llm = ClassificationService(
        FakeLlm(),
        draft_bl_request_rule_enabled=False,
    ).classify(email)

    assert enabled.category == EmailCategory.GENERAL
    assert enabled.decided_by == "rule"
    assert disabled_rules_only.category == EmailCategory.GENERAL
    assert disabled_rules_only.decided_by == "fallback_default"
    assert disabled_with_llm.category == EmailCategory.GENERAL
    assert disabled_with_llm.decided_by == "llm"


def test_classifier_identifies_si_requests_and_document_instruction_labels():
    assert classify_email(
        {
            "subject": "Request SI",
            "body": "Please send the shipping instruction for this booking.",
            "attachments": [],
        }
    ) == EmailCategory.SI_REQUEST
    assert detect_document_type("BILL OF LADING INSTRUCTION\nShipper: Example") == DocumentType.SHIPPING_INSTRUCTION


def test_text_extraction_normalizes_equivalent_values():
    si = ParsedDocument(
        path="attachments/si.txt",
        text="""SHIPPING INSTRUCTION\nShipper: Meridian Pulp Sdn Bhd\nConsignee: Harbour Line Trading Ltd\nNotify Party: Yangtze Logistics Co., Ltd.\nPOL: Port Klang, Malaysia (MYPKG)\nPOD: Shanghai, China (CNSHA)\nNo. of Containers or Packages: 3 x 40'HC\nGross Weight (KG): 22,000 KGS""",
        document_type=DocumentType.SHIPPING_INSTRUCTION,
    )
    bl = ParsedDocument(
        path="attachments/bl.txt",
        text="""BILL OF LADING (DRAFT)\nSHIPPER: MERIDIAN PULP SDN BHD\nCONSIGNEE: HARBOUR LINE TRADING LIMITED\nNotify: YANGTZE LOGISTICS CO LTD\nPort of Loading (POL): PORT KLANG (MYPKG)\nPOD: SHANGHAI (CNSHA)\nContainer Count: 3 X 40HC\nGross Wt (kgs): 22000 KG""",
        document_type=DocumentType.BILL_OF_LADING,
    )
    si_extracted = extract_document(si, DocumentRole.SI)
    bl_extracted = extract_document(bl, DocumentRole.BL)
    comparisons = compare_documents(si_extracted, bl_extracted)
    assert all(comparison.result == "match" for comparison in comparisons)


def test_order_mode_consignee_is_explicit_and_comparable():
    si = extract_document(
        ParsedDocument(
            path="si.txt",
            text="SHIPPING INSTRUCTION\nTo the Order of: Harbour Line Trading Ltd",
            document_type=DocumentType.SHIPPING_INSTRUCTION,
        ),
        DocumentRole.SI,
    )
    bl = extract_document(
        ParsedDocument(
            path="bl.txt",
            text="BILL OF LADING\nTo the Order of (??): Harbour Line Trading Ltd",
            document_type=DocumentType.BILL_OF_LADING,
        ),
        DocumentRole.BL,
    )
    consignee = next(field for field in si.fields if field.field_name == CanonicalField.CONSIGNEE)
    assert consignee.raw_value.startswith("To the Order of")
    comparison = next(item for item in compare_documents(si, bl) if item.field_name == CanonicalField.CONSIGNEE)
    assert comparison.result == "match"


@pytest.mark.parametrize(
    ("policy", "bl_party", "expected"),
    [
        ("review", "Harbour Line Trading Ltd", "skipped"),
        ("same_party_match", "Harbour Line Trading Ltd", "match"),
        ("same_party_match", "Different Trading Ltd", "mismatch"),
        ("always_mismatch", "Harbour Line Trading Ltd", "mismatch"),
    ],
)
def test_named_and_order_mode_consignee_policy(policy, bl_party, expected):
    si = extract_document(
        ParsedDocument(
            path="si.txt",
            text="SHIPPING INSTRUCTION\nConsignee: Harbour Line Trading Limited",
            document_type=DocumentType.SHIPPING_INSTRUCTION,
        ),
        DocumentRole.SI,
    )
    bl = extract_document(
        ParsedDocument(
            path="bl.txt",
            text=f"BILL OF LADING\nTo the Order of: {bl_party}",
            document_type=DocumentType.BILL_OF_LADING,
        ),
        DocumentRole.BL,
    )

    comparison = next(
        item
        for item in compare_documents(si, bl, order_mode_policy=policy)
        if item.field_name == CanonicalField.CONSIGNEE
    )

    assert comparison.result == expected


def test_one_field_difference_is_a_mismatch():
    si = extract_document(
        ParsedDocument(
            path="si.txt",
            text="""SHIPPING INSTRUCTION
Shipper: Meridian Pulp
Consignee: Harbour Line
Notify Party: Yangtze Logistics
POL: Port Klang (MYPKG)
POD: Shanghai (CNSHA)
Container Count: 3 x 40HC
Gross Weight: 22000 KG""",
            document_type=DocumentType.SHIPPING_INSTRUCTION,
        ),
        DocumentRole.SI,
    )
    bl = extract_document(
        ParsedDocument(
            path="bl.txt",
            text="""BILL OF LADING
Shipper: Meridian Pulp
Consignee: Harbour Line
Notify Party: Yangtze Logistics
POL: Port Klang (MYPKG)
POD: Shanghai (CNSHA)
Container Count: 4 x 40HC
Gross Weight: 22000 KG""",
            document_type=DocumentType.BILL_OF_LADING,
        ),
        DocumentRole.BL,
    )
    result = decide_result(
        email_id="email_001",
        run_id="run",
        category=EmailCategory.BL_COMPARISON,
        comparisons=compare_documents(si, bl),
        documents=[si, bl],
    )
    assert result.status == ComparisonStatus.MISMATCH
    assert result.has_defect is True
    assert result.defect_fields == [CanonicalField.CONTAINER_COUNT]


def test_missing_value_is_review_not_mismatch():
    si = extract_document(
        ParsedDocument(path="si.txt", text="SHIPPING INSTRUCTION\nShipper: Meridian Pulp", document_type=DocumentType.SHIPPING_INSTRUCTION),
        DocumentRole.SI,
    )
    bl = extract_document(
        ParsedDocument(path="bl.txt", text="BILL OF LADING\nShipper: Meridian Pulp", document_type=DocumentType.BILL_OF_LADING),
        DocumentRole.BL,
    )
    result = decide_result(
        email_id="email_002",
        run_id="run",
        category=EmailCategory.BL_COMPARISON,
        comparisons=compare_documents(si, bl),
        documents=[si, bl],
    )
    assert result.status == ComparisonStatus.NEEDS_REVIEW
    assert result.review_reason == "missing_value"
