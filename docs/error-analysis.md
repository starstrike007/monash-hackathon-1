# Pipeline tuning error analysis

Date: 2026-09-22 (Asia/Singapore)

## Measurement boundary

The official `score_cli.py` and the evaluator Docker bundle are not present in
this workspace, so no official score or private reference data was used. The
fallback set is [`tests/dev_set.json`](../tests/dev_set.json), a hand-checked
set of 30 `BL_COMPARISON` emails covering plain text, DOCX/XLSX, readable PDF,
scanned/image-only PDF, and unreadable PDF inputs. The seven expected field
values and expected decision for every case were checked against the source
attachments. The fallback evaluator is `backend/evaluate_dev_set.py`.

The full OpenAI-enabled baseline ran into the configured provider, but the
provider was unreachable in this environment. It made 147 stage-1 calls (441
attempts, 294 retries), received zero tokens, and recorded 147 visible
`llm_error` failures. The pipeline completed with its deterministic rules
fallback. A second full run produced the identical evaluator-shaped
`submission.json` SHA-256 (`DEE67E296592AC9CE7FB8DB97A6A8CC907F63A0261907C5D548EA6B8B44F3501`).
Only per-run latency telemetry differed in `classification_report.json`.

Baseline dev-set results:

| Measure | Result |
| --- | ---: |
| Composite fallback score | 0.8944 |
| Classification F1 | 1.0000 |
| Defect F1 | 0.8108 |
| End-to-end exact row rate | 0.7667 (23/30) |
| Review-handling F1 | 1.0000 |

The composite is a transparent fallback metric defined as the mean of the four
reported measures above. It is not comparable to the official score.

## Ranked observed causes

The baseline had seven wrong rows on the checked set. It had no category errors
and no review-reason errors; all 12 expected review decisions were routed to
review with the correct reason.

1. **Port normalization discarded the explicit place name and retained only a
   five-character code — 4 affected cases.** `normalize_port()` returned the
   code whenever one was present. Synthetic or conflicting source documents
   can therefore say two different cities with the same code and be called a
   match. This caused missed `port_of_discharge` defects in `email_013`,
   `email_025`, and `email_071`, and hid the known discharge defect in the
   review case `email_065`. Examples: `email_013` says Mombasa versus
   Tuticorin with `KEMBA`; `email_025` says Fremantle versus Busan with
   `AUFRE`.

2. **PDF line reconstruction treated a compound notify label as part of the
   value — 3 affected cases.** The extracted PDF text contains OCR/layout
   joins such as `Notify Party/Intermediate ConsKiTgPne ...`. The rule matcher
   accepts that whole line as the notify-party value instead of separating the
   label from the party name. This created false notify mismatches in
   `email_208` and `email_407`, and an extra false defect alongside the genuine
   count/weight mismatch in `email_351`. Examples: `email_208` and `email_407`
   have the same notify party on both source documents when read from the
   rendered PDFs.

## Causes checked but not observed as a baseline error

The 30-case set deliberately includes company suffix variants, order-mode
consignees, mixed file formats, number formatting, container counts, and
unreadable PDFs. Those cases did not produce an additional baseline error after
the existing rules. Bilingual labels, unit conversion beyond kilograms,
multi-term container sums, and classification of non-comparison mail are not
represented enough in this 30-case fallback set to claim a measured defect.
They remain follow-up inspection areas rather than speculative fixes.

## Fix order

1. Preserve a canonical port name together with any code, use observed alias
   mappings only for equivalent names, and send conflicting explicit names to
   mismatch/review rather than silently trusting a code.
2. Make the field extractor recognize the full notify-party label boundary and
   validate the extracted value against the source line so OCR label fragments
   cannot become party names.
3. Re-run the same dev set and the full pipeline after each change. Keep a
   change only when the dev score holds or improves, no false-`OK` count rises,
   and the backend regression suite remains green.
