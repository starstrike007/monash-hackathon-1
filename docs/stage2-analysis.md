# Stage 2 analysis

This is a read-only analysis of the current Stage 2 rules path. It does not
change classification, extraction, normalization, comparison, or decision
rules.

## Method

- Scope: the 153 emails classified as `BL_COMPARISON` by the deterministic
  rules-only classifier.
- A “supported pair” means exactly one readable Shipping Instruction and
  exactly one readable Bill of Lading were resolved from the referenced
  attachments. The format is reported in SI/BL order.
- `UNRESOLVED` means the pair could not meet that definition because of a
  missing, unreadable, unknown, wrong-type, duplicate, or otherwise ambiguous
  candidate.
- Missing/ambiguous field counts are occurrences across the extracted fields
  of readable documents with a resolved SI or BL role. `missing`,
  `placeholder`, and `ambiguous` are counted separately; a review result is
  not treated as a mismatch.
- Labels are compared with the explicit field-label alias configuration. The
  unmapped list below is limited to field-like labels that are not one of the
  seven canonical comparison fields; unrelated invoice, packing, and
  certificate labels are intentionally not added as aliases.

## Document resolution and format pairing

| SI format | BL format | Emails |
| --- | --- | ---: |
| `.txt` | `.txt` | 89 |
| `.xlsx` | `.xlsx` | 7 |
| `.xlsx` | `.docx` | 8 |
| `.pdf` | `.pdf` | 9 |
| Unresolved | Unresolved | 40 |
| **Total** |  | **153** |

113 emails (74%) had exactly two supported readable documents. The remaining
40 were routed through the explicit unresolved-document path.

## Outcomes and review routing

| Outcome | Emails |
| --- | ---: |
| `OK` | 40 |
| `MISMATCH` | 32 |
| `NEEDS_REVIEW` | 81 |

| Review reason | Emails |
| --- | ---: |
| `missing_value` | 41 |
| `missing_attachment` | 29 |
| `unreadable` | 6 |
| `wrong_doc_type` | 5 |
| **Total review** | **81** |

The 29 `missing_attachment` cases include emails where the required SI or BL
was not available. The 6 `unreadable` cases include malformed or no-text PDFs;
they are not treated as empty documents and are not sent to a vision fallback.

## Most common unavailable fields

| Canonical field | Unavailable occurrences | State detail |
| --- | ---: | --- |
| `port_of_discharge` | 3 | 2 placeholders, 1 missing |
| `gross_weight_kg` | 3 | 1 missing, 1 placeholder, 1 ambiguous |
| `shipper` | 1 | 1 missing |
| `consignee` | 1 | 1 missing |
| `notify_party` | 1 | 1 missing |
| `port_of_loading` | 1 | 1 missing |
| `container_count` | 1 | 1 missing |

These are field-state occurrences, not email counts: one email can contribute
more than one unavailable field, and both documents can contribute evidence.

## Labels not mapped to canonical comparison fields

The following labels were observed but intentionally remain unmapped because
they identify non-comparison data or have ambiguous semantics:

- `Export Carrier (vessel, voyage)` and its `船名` variant;
- `Vessel (船名)` and `Vessel Name (船名)`;
- `B/L No.`, including `B/L NO.(提单号)`;
- `Exporter` in certificate/invoice-style documents;
- `Seller` and `Buyer` in invoice-style documents.

The observed CJK labels for the seven fields are mapped in the alias config:
`发货人`, `收货人`, `通知人`, `装货港`, `卸货港`, `箱数`, and `毛重`.
`提单号` is deliberately not mapped because it is a Bill of Lading identifier,
not one of the seven comparison values.

## Reproduction

The counts above were produced with a rules-only in-memory pass over the
bundled `data/inbox` and `data/attachments` paths. The Step 1 gate export used:

```powershell
Set-Location backend
.\.venv\Scripts\python.exe export_stage1.py --rules-only --runtime-dir ..\.runtime\overnight-step1 --output-dir ..\.runtime\overnight-step1-output
```

No evaluator answer key, prohibited external directory, or scoring command was
used.
