# Hackathon Problem Statement

## Overview

Shipping and logistics teams receive large volumes of customer emails every day. These emails may contain requests related to Shipping Instructions, Bills of Lading, invoices, general enquiries, or unrelated messages.

Operations staff currently need to manually:

1. Read each email.
2. Understand the customer's intent.
3. Classify the request.
4. Identify and open the relevant attachments.
5. Determine which documents are Shipping Instructions and Bills of Lading.
6. Compare the documents field by field.
7. Detect discrepancies.
8. Decide whether the documents can be approved or require further review.

This manual process is repetitive, time-consuming, and prone to human error.

---

## Core Challenge

Build a system that can automatically:

### 1. Understand and classify incoming emails

The system should analyze the email subject, body, and available context to understand what the sender is requesting.

Emails should be classified into the appropriate category, such as:

* `BL_COMPARISON`
* `SI_REQUEST`
* `INVOICE_QUERY`
* `GENERAL`
* `SPAM`

The system should understand the intent of the message rather than relying only on keywords.

For example:

> "Attached is the draft BL. Please check against our shipping instruction before confirmation."

should be understood as a request to compare a draft Bill of Lading against a Shipping Instruction.

---

## 2. Understand the attached documents

For emails requiring Bill of Lading verification, the system must inspect the attachments and determine what each document actually is.

Possible document types include:

* Shipping Instruction
* Bill of Lading
* Commercial Invoice
* Packing List
* Unknown or unreadable document

The system should not rely only on filenames.

For example, a file named `BL.pdf` could actually contain a Commercial Invoice.

---

## 3. Extract relevant shipping information

When a valid Shipping Instruction and Bill of Lading are available, the system should extract and understand the required fields from both documents.

The seven primary comparison fields are:

* Shipper
* Consignee
* Notify Party
* Port of Loading
* Port of Discharge
* Container Count
* Gross Weight

Different documents may use different terminology for the same information.

For example:

```text
Port of Loading
Load Port
POL
```

should all be understood as the same field.

---

## 4. Normalize equivalent information

The system should recognize semantically equivalent values even when formatting differs.

Examples:

```text
21,500 KG
21 500.00 KGS
```

should be treated as the same gross weight.

Similarly:

```text
PORT KLANG, MALAYSIA
Port Klang, Malaysia
MYPKG
```

may refer to the same port.

Formatting differences should not be treated as genuine defects.

---

## 5. Compare the Shipping Instruction and Bill of Lading

After extracting and normalizing the information, the system should compare the two documents field by field.

The result should identify whether:

### `OK`

All required fields match.

### `MISMATCH`

One or more fields contain genuine discrepancies.

The system should identify exactly which fields are different.

Example:

```text
Shipping Instruction:
Port of Discharge: Mombasa, Kenya

Bill of Lading:
Port of Discharge: Tuticorin, India
```

Result:

```json
{
  "status": "MISMATCH",
  "has_defect": true,
  "defect_fields": [
    "port_of_discharge"
  ]
}
```

### `NEEDS_REVIEW`

The system cannot safely perform the comparison.

Possible reasons include:

* Missing Bill of Lading
* Missing Shipping Instruction
* Wrong attachment type
* Missing field value
* `TBA`, `N/A`, or blank values
* Unreadable document
* Scanned document that cannot be interpreted confidently

The system should avoid guessing when there is insufficient information.

---

## Key Requirement

The goal is not simply to perform a text comparison.

The system should understand:

```text
Email intent
      ↓
Document type
      ↓
Document content
      ↓
Equivalent values
      ↓
Actual discrepancies
```

The system therefore needs to distinguish between:

```text
Different formatting
        ≠
Actual discrepancy
```

---

## Expected Workflow

```text
Incoming Email
      ↓
Understand Intent
      ↓
Classify Email
      ↓
Is BL Comparison Required?
      ↓
Inspect Attachments
      ↓
Identify SI + Draft BL
      ↓
Extract Required Fields
      ↓
Normalize Values
      ↓
Compare Documents
      ↓
┌──────────────┬──────────────┬───────────────┐
│      OK      │   MISMATCH   │ NEEDS_REVIEW  │
└──────────────┴──────────────┴───────────────┘
```

---

## Important Edge Cases

The provided dataset contains cases that require more than simple extraction.

The system should handle situations such as:

```text
Shipping Instruction + correct Bill of Lading
```

```text
Shipping Instruction + wrong document
```

```text
Shipping Instruction + missing Bill of Lading
```

```text
Blank or unavailable fields
```

```text
TBA / N/A values
```

```text
Different terminology for the same field
```

```text
Different formatting of equivalent values
```

```text
Scanned or difficult-to-read documents
```

```text
Multiple genuine discrepancies
```

A reliable system should escalate uncertain cases instead of producing a potentially incorrect approval.

---

## Dataset

The provided dataset contains approximately:

```text
520 emails
250 attachments
```

with multiple document formats including:

```text
TXT
PDF
XLSX
DOCX
```

The dataset can be used to develop and evaluate the classification, document understanding, extraction, and comparison pipeline.

---

## Evaluation Focus

The solution is primarily evaluated on its ability to correctly:

1. Classify incoming emails.
2. Understand the sender's intent.
3. Identify the relevant documents.
4. Extract the required information.
5. Detect actual discrepancies between the Shipping Instruction and Bill of Lading.
6. Avoid incorrect comparisons when information is unavailable or unreliable.

---

## Problem Statement in One Sentence

> Build an intelligent shipping-document system that understands incoming customer emails, classifies their intent, identifies the relevant shipping documents, and accurately detects discrepancies between Shipping Instructions and Bills of Lading.
