# SDOC Hackathon Dataset & Evaluation Context

# Official Use-Case Requirements

This section is based on the official **Shipping document verification** use-case document and should be treated as the source of truth when it conflicts with dataset inference.

## Business Context

A shipping operations team receives multiple types of messages in one inbox:

- document-comparison requests
- new Shipping Instruction requests
- invoice questions
- general operational updates
- spam

For document-comparison requests, the **Shipping Instruction (SI) is the reference document**. The system compares it against the draft Bill of Lading (BL) to catch incorrect shipment details before the BL is finalized.

The business problems are:

- staff must manually identify which emails require action
- overlooked document-checking requests never reach the checking step
- manual SI-vs-BL comparison is repetitive and error-prone
- names, ports, quantities, and weights can be missed
- equivalent fields can use different labels across documents

Example of semantic equivalence:

```text
Port of Loading
Load Port
```

These refer to the same field and must not be treated as different fields merely because the labels differ.

## Required Capabilities

The system should generally be able to:

1. **Classify**
   - distinguish document-comparison requests
   - distinguish new SI requests
   - distinguish invoice queries
   - distinguish general messages
   - distinguish spam

2. **Extract data**
   - for comparison requests, read the SI and BL
   - identify the corresponding shipment fields

3. **Compare**
   - compare the SI and BL values
   - surface the exact fields that differ
   - show the SI value and BL value side by side where useful

4. **Ask for help**
   - if the system cannot make a dependable decision, escalate to human review
   - include the relevant context and evidence
   - do not guess
   - do not fail silently

Only document-comparison requests continue to the document-checking stage. Other email categories only need classification.

---

## Official Comparison Scope

Exactly seven shipment fields must be checked:

- `shipper`
- `consignee`
- `notify_party`
- `port_of_loading`
- `port_of_discharge`
- `container_count`
- `gross_weight_kg`

If all seven fields match, the user-facing report should communicate:

```text
No mismatch detected.
```

If one or more differ, flag only the fields that actually differ.

Example:

```text
SI container count: 3
BL container count: 4
SI gross weight: 22,000 kg
BL gross weight: 22,000 kg
```

The only defect is:

```text
container_count
```

Do not flag `gross_weight_kg` when the values agree.

---

## Basic vs Advanced Stage

### Basic expectations

The common baseline is:

- classify emails
- extract fields from plain-text attachments
- compare the values

Get this working before adding advanced behavior.

### Advanced-stage challenges

The supplied sample data can include harder, more realistic cases.

#### PDF and Word attachments

Support documents where information appears in:

- PDFs
- Word files
- tables
- different page layouts

#### Scanned documents

Some inputs can be:

- image-only PDFs
- scanned pages

Possible reading approaches include:

- OCR
- vision-capable LLMs
- a combination of both

The implementation should choose the smallest reliable approach supported by the project.

#### Messier inputs

Expect:

- varied field labels
- formatting differences
- misleading email subjects
- missing attachments

The system must distinguish:

```text
real discrepancy
```

from:

```text
reading / formatting / input problem
```

#### Reliability and human review

Escalate rather than guess when:

- a document is unreadable
- a required value is missing
- the result is uncertain
- processing fails in a way that prevents a dependable decision

A review case should include:

- source evidence
- reason for review
- enough context for a human to confirm or correct the result

Processing failures should be visible and retryable.

False alarms matter. Accuracy is not just finding discrepancies, but also avoiding invented discrepancies when the system is uncertain.

---

## Dataset Access

The official dataset contains:

- inbox records in JSON
- SI and BL attachments referenced by those emails
- `sample_submission.json`
- `loader.py`

The private answer key is not included.

Two supported access modes exist.

### Static bundle

Read the extracted files directly from the ZIP.

Expected structure includes:

```text
inbox/
attachments/
sample_submission.json
loader.py
```

### Local server

The same dataset can be served locally with Docker.

Typical command:

```bash
docker compose up --build
```

The service is then available at:

```text
http://localhost:8080
```

No database is required.

### Loader interface

The provided loader exposes the same interface for local files and the local HTTP server.

Conceptually:

```python
from loader import Inbox

inbox = Inbox("data")
# or:
inbox = Inbox("http://localhost:8080")

for email in inbox:
    ...

text = inbox.read_text(path)
```

When first implementing the pipeline, trace one email together with its referenced attachments end to end before attempting the full dataset.

---

## Self-Evaluation Workflow

The local server exposes an optional self-evaluation mechanism.

The output should follow the structure expected by:

```text
sample_submission.json
```

The submission is one JSON object keyed by `email_id`.

Include **every email** in the dataset.

For a document-comparison request, report at least:

- category
- whether a mismatch was found
- which fields differ

The internal architecture can be anything. Only the submitted shape needs to follow the evaluator format.

Submit via either:

```text
POST /submit
```

or:

```python
inbox.submit(...)
```

The evaluator returns a scoreboard against a private reference set without exposing the reference answers.

Use this loop during development:

```text
implement
  ↓
run pipeline
  ↓
submit output
  ↓
inspect score
  ↓
inspect source documents for errors
  ↓
fix real problems
  ↓
repeat
```

Do not blindly change logic just to match a score.

If a result differs from the private reference:

1. inspect the original email and documents
2. determine whether the system is actually wrong
3. if the system's decision is reasonable, record the reason
4. separately test incomplete, unclear, unreadable, and uncertain inputs

The self-evaluation score does not fully measure human-review quality, evidence quality, retry behavior, or whether uncertainty is handled safely.

---

# Official Requirements vs Dataset Inference

Keep a clear distinction between:

## Official requirements

These come from the use-case document and should drive implementation:

- five email categories
- SI is the reference document
- compare exactly seven fields
- only document-comparison requests continue to comparison
- show exact mismatches
- handle different labels and formatting
- support harder document formats in the advanced stage
- escalate uncertain cases to a human rather than guessing
- use the self-evaluation loop during development

## Dataset-derived observations

These are useful engineering clues from inspection of the provided sample bundle, but they are not guaranteed organizer labels:

- approximate category counts
- approximate `OK` / `MISMATCH` / `NEEDS_REVIEW` counts
- repeated wording templates
- common defect frequencies
- observed wrong-document patterns
- observed missing-value patterns
- observed attachment combinations

Use dataset-derived patterns to improve robustness, but do not hard-code behavior that only works for the inspected examples.

## Problem Overview

The system processes an inbox of logistics emails and must perform two tasks:

1. **Classify every email** into exactly one category:
   - `BL_COMPARISON`
   - `SI_REQUEST`
   - `INVOICE_QUERY`
   - `GENERAL`
   - `SPAM`

2. For emails classified as `BL_COMPARISON`, compare the **Shipping Instruction (SI)** against the **draft Bill of Lading (BL)** and return:
   - `OK` when all seven canonical fields match.
   - `MISMATCH` when one or more fields differ.
   - `NEEDS_REVIEW` when the comparison cannot be decided reliably.

For mismatches, also return:
- `has_defect`
- `defect_fields`

The expected comparison fields are:

- `shipper`
- `consignee`
- `notify_party`
- `port_of_loading`
- `port_of_discharge`
- `container_count`
- `gross_weight_kg`

---

## Dataset Context

The provided bundle contains approximately **520 emails**.

The organizer does not provide explicit ground-truth labels in the bundle, but the dataset is highly templated and repeated patterns strongly suggest an approximate distribution of:

- `GENERAL`: ~151
- `BL_COMPARISON`: ~129
- `SI_REQUEST`: ~125
- `INVOICE_QUERY`: ~75
- `SPAM`: ~40

Treat these counts as dataset analysis, not guaranteed official labels.

The dataset is not completely random. Many emails are generated from recurring templates, which means structured heuristics and normalization can be useful alongside LLM reasoning.

---

## Common Category Patterns

### `BL_COMPARISON`

Typical intent:
- compare SI against draft BL
- check draft BL against SI
- verify documents
- confirm whether BL details match instructions

Most `BL_COMPARISON` emails include attachments, commonly an SI and a BL.

However, attachment presence alone is not enough to determine the class.

Important:
- Some subjects also appear in `GENERAL`.
- A message mentioning "BL" is not automatically `BL_COMPARISON`.
- The actual intent must be to compare or verify SI versus draft BL.

Examples of ambiguous subjects include:
- `TO CONFIRM DOCS`
- `REQUEST BL DRAFT`
- `Draft BL ...`

Use the subject, email body, and attachment metadata together.

---

### `SI_REQUEST`

These emails often contain a full Shipping Instruction directly in the email body.

Common pattern:

```text
Please find Shipping instruction for ...

POL: ...
POD: ...

Shipper:
...

Consignee:
...

Notify Party:
...

Description of Goods:
...
GROSS WT: ...

Please revert with draft BL once available.
```

These are usually straightforward to identify.

---

### `INVOICE_QUERY`

Common recurring intents include:

- missing GR for an invoice
- invoice query or discrepancy
- detention / demurrage / charge confirmation
- cancellation of an invoice

Typical phrases include:

```text
GR is still missing for invoice...
```

```text
Query on invoice...
```

```text
Requesting to cancel invoice...
```

Classification should be intent-based rather than relying on the presence of the word `invoice` alone.

---

### `SPAM`

Spam examples include:

- cryptocurrency investment scams
- fake lottery/prize emails
- fake parcel/customs fee notices
- mailbox/storage phishing
- suspicious promotional offers

These are generally very different from legitimate logistics communication.

---

### `GENERAL`

`GENERAL` is the catch-all for legitimate logistics or operational messages that do not belong to the specialized workflows above.

Examples include:

- asking for a draft BL without asking for SI-vs-BL comparison
- billing automation notifications
- outstanding BL lists
- berthing reports
- operational status updates
- reminders
- office announcements

A message containing the term `BL` can still be `GENERAL`.

---

# Known Dataset Problems and Edge Cases

## 1. Do Not Trust Filenames

An attachment named like:

```text
email_501_BL.txt
```

may not actually contain a Bill of Lading.

The dataset includes deliberately incorrect document types such as:

- Commercial Invoice
- Packing List
- Certificate of Origin

Always verify document type from the document content.

If the required BL or SI is replaced by the wrong document type, return:

```text
NEEDS_REVIEW
```

with an appropriate review reason.

---

## 2. Missing Attachments

Some BL-comparison emails intentionally have:

- only the SI
- only one relevant document
- no attachments at all

Do not interpret a missing document as a mismatch.

Return:

```text
NEEDS_REVIEW
```

with a reason such as:

```text
missing_attachment
```

---

## 3. Unreadable Documents

The dataset includes cases such as:

- corrupt PDFs
- image-only/scanned PDFs
- documents that cannot be reliably parsed

An extraction failure must not become `MISMATCH`.

If the document cannot be read reliably, return:

```text
NEEDS_REVIEW
```

with a reason such as:

```text
unreadable
```

---

## 4. Missing Values

Some documents deliberately omit required values or use placeholders such as:

```text
Gross Weight: N/A
Port of Discharge: TBA
SHIPPER:
Container Count:
Gross Weight: ____MT
```

This is different from a real mismatch.

If a required field is missing in a way that makes comparison impossible, return:

```text
NEEDS_REVIEW
```

rather than `MISMATCH`.

---

## 5. Formatting Differences Are Not Defects

The same value can appear in different forms.

Examples:

```text
341,715 KG
341715
341 715 kg
```

These should normalize to the same numeric value.

Likewise:

```text
6 x 40'HC
6X40'HC
6 x 40 HC
```

should normalize to the same container representation.

Do not use raw string equality for comparisons.

---

## 6. Field Labels Vary

The dataset uses different labels for the same semantic field.

Examples:

```text
Port of Loading
Load Port
POL
PORT OF LOADING
Port of Loading (POL)
```

All map to:

```text
port_of_loading
```

Likewise:

```text
Notify
Notify Party
Notify Party/Intermediate Consignee
```

map to:

```text
notify_party
```

Extraction should be semantic, not dependent on one exact label.

---

## 7. Multiple File Formats

Relevant attachments may appear as:

- `.txt`
- `.pdf`
- `.xlsx`
- `.docx`

The pipeline must support multiple document formats.

Do not assume every comparison can be handled by reading plain text files.

---

## 8. Subject Lines Are Not Sufficient

Some subject lines are shared across multiple categories.

Classification should consider:

- subject
- body
- sender
- attachment count
- attachment names
- attachment content when necessary

Do not implement a subject-only classifier.

---

# BL Comparison Characteristics

The dataset appears to contain roughly **129 BL comparison cases**.

Approximate outcomes from dataset inspection:

- `OK`: ~63
- `MISMATCH`: ~46
- `NEEDS_REVIEW`: ~20

Treat these as analytical estimates, not official labels.

Among normal mismatch cases, the most frequently differing fields appear to be:

1. `container_count`
2. `port_of_discharge`
3. `gross_weight_kg`
4. `notify_party`
5. `consignee`
6. `shipper`
7. `port_of_loading`

Do not optimize only for these frequent fields. All seven must be compared.

---

# `NEEDS_REVIEW` Cases

The dataset intentionally contains several types of unresolvable comparisons.

Observed review reasons include:

- `wrong_doc_type`
- `missing_attachment`
- `unreadable`
- `missing_value`

These are important evaluation cases.

Do not force every BL comparison into `OK` or `MISMATCH`.

---

# Evaluation Priorities

The hackathon score is split across three areas:

- **50% End-to-end accuracy**
  - The complete pipeline must return the correct final result.

- **30% Stage-1 macro-F1**
  - Emails must be correctly classified into the five categories.
  - Macro-F1 means every class matters, including smaller classes such as `SPAM`.

- **20% Defect-F1**
  - For `BL_COMPARISON`, the exact defective fields must be identified correctly.

## Important Consequence

Do not spend most of the engineering effort only improving email classification.

Correctly identifying:

```text
BL_COMPARISON
```

is only the first step.

The system must also correctly:

1. find the relevant SI and BL
2. validate document types
3. handle unreadable or missing documents
4. extract the seven fields
5. normalize values
6. compare them accurately
7. determine `OK`, `MISMATCH`, or `NEEDS_REVIEW`
8. return the exact defect fields

A correct category with an incorrect comparison still loses a large part of the score.

---

# Recommended Architecture

Prefer a staged pipeline instead of one giant prompt.

```text
Email
  ↓
Stage 1: classify email
  ↓
If BL_COMPARISON
  ↓
Validate attachments and document types
  ↓
Parse TXT / PDF / XLSX / DOCX
  ↓
Extract SI and BL into canonical structured fields
  ↓
Normalize values
  ↓
Deterministically compare all seven fields
  ↓
Return status + review reason / defect fields
```

---

# LLM vs Deterministic Logic

Use the LLM where semantic interpretation is helpful.

Good LLM responsibilities:

- classify ambiguous email intent
- recognize document type from content
- map varying field labels to canonical fields
- extract semi-structured values from messy documents

Prefer deterministic code for:

- numeric normalization
- weight normalization
- container-count normalization
- field-by-field equality
- defect list generation
- missing-field checks
- final `OK` vs `MISMATCH` decision after extraction

Example canonical structure:

```json
{
  "shipper": "...",
  "consignee": "...",
  "notify_party": "...",
  "port_of_loading": "...",
  "port_of_discharge": "...",
  "container_count": 6,
  "gross_weight_kg": 131322
}
```

Then compare canonical values with normal application logic.

---

# Implementation Principles

- Do not trust filenames as document truth.
- Do not treat parsing failure as mismatch.
- Do not treat missing required values as mismatch when comparison is impossible.
- Do not compare raw strings when semantic normalization is possible.
- Do not classify based on subject alone.
- Do not assume every BL mention is `BL_COMPARISON`.
- Validate external/document input at boundaries.
- Prefer explicit structured outputs from the LLM.
- Keep comparison logic reproducible and testable.
- Add regression tests for every observed edge case.
- Prefer the smallest reliable end-to-end system over unnecessary infrastructure.

---

# Priority Test Cases

At minimum, verify the pipeline against:

1. normal `SI_REQUEST`
2. normal `INVOICE_QUERY`
3. obvious `SPAM`
4. legitimate `GENERAL` mentioning BL
5. `BL_COMPARISON` with all seven fields matching
6. one-field mismatch
7. multiple-field mismatch
8. equivalent formatting but same semantic value
9. missing BL
10. missing SI
11. wrong attachment type
12. unreadable PDF
13. missing required field
14. misleading filename
15. different field label names
16. mixed attachment formats

These cases should be covered by automated regression tests where possible.
