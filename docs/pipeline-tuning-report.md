# Pipeline accuracy tuning report

Date: 2026-09-22 (Asia/Singapore)
Branch: `pipeline-accuracy-tuning`
Baseline tag: `pre-tuning`

## Scores

The official scorer was unavailable: neither `score_cli.py` nor the evaluator
Docker bundle exists in this workspace. No private answer key or crafted probe
submission was used. The numbers below are therefore from the hand-checked
30-case fallback set in [`tests/dev_set.json`](../tests/dev_set.json), not from
the official evaluator.

| Measure | Baseline | Final |
| --- | ---: | ---: |
| Composite fallback score | 0.8944 | 1.0000 |
| Classification F1 | 1.0000 | 1.0000 |
| Defect F1 | 0.8108 | 1.0000 |
| End-to-end exact row rate | 0.7667 (23/30) | 1.0000 (30/30) |
| Review-handling F1 | 1.0000 | 1.0000 |

The composite is the mean of the four fallback measures above. It is a local,
transparent development metric and is not an official score.

## Root causes and fixes

1. Port normalization discarded the printed place name and compared only the
   five-character code. This affected four checked cases (`email_013`,
   `email_025`, `email_065`, `email_071`). Normalization now preserves a
   canonical descriptive name alongside the code and keeps conflicting names
   distinct while still collapsing known terminal aliases.
2. Overlapping PDF text objects merged the `Notify Party/Intermediate
   Consignee` label with the visible party value. This affected
   `email_208`, `email_351`, and `email_407`. Extraction now validates the
   compound-label result against the following address block, reuses the
   consignee value only when the address context matches, and marks it
   ambiguous instead of guessing when it does not.

No additional cause was observed in the checked set. The set includes plain
text, DOCX/XLSX, readable PDF, image-only PDF, unreadable PDF, company-name
variants, order-mode consignees, number formatting, and container counts.

The two fixes were committed separately:

- `1f2d9d1` — port normalization, dev score `0.8944 -> 0.9567`
- `777a70e` — PDF notify extraction, dev score `0.9567 -> 1.0000`

No attempted fix was reverted. Tuning stopped after the second fix because the
fallback set was perfect and further changes would not be evidence-led.

## Full pipeline measurements

The OpenAI-enabled baseline and final runs used fresh scratch runtime/output
directories. The configured key was present, but the provider was unreachable:
all 147 unresolved classification calls ended in `APIConnectionError` after
441 attempts and 294 retries. They used zero input/output/reasoning tokens, so
recorded LLM cost was zero; the pipeline visibly used its deterministic
fallback for those cases.

Full-dataset status counts changed as follows:

| Status | Baseline | Final |
| --- | ---: | ---: |
| OK | 411 | 409 |
| MISMATCH | 28 | 30 |
| NEEDS_REVIEW | 81 | 81 |

Review-reason counts were unchanged: `missing_value` 41,
`missing_attachment` 29, `unreadable` 6, `wrong_doc_type` 5, and 439 rows with
no review reason.

The final exports are at:

- `.runtime/pipeline-tuning-final-output/final_submission.json`
- `.runtime/pipeline-tuning-final2-output/submission.json`

Both final submissions have SHA-256
`8E19BD0E984B637381A01198FF1F1C5907BD3AD9230BFA611F9258B7BBD171A7` and are
identical. The per-email latency telemetry in the classification reports
varied between runs, but the evaluator-shaped decisions did not.

## Remaining limitations

There are no known wrong rows in the hand-checked set after the fixes. The
official 520-email accuracy and F1 remain unmeasured because the scorer is
absent. The 147 provider failures also mean the real OpenAI classification
fallback was not exercised; examples include `email_006` and `email_011`, which
were recorded as visible low-confidence fallback cases rather than silently
treated as successful model classifications. Unseen bilingual labels, unusual
weight units, and multi-term container sums remain unquantified rather than
being claimed as fixed.

## Verification

- Backend: `71 passed, 1 xfailed, 2 xpassed`.
- Frontend: `npm run build` passed.
- Final submission contains all 520 email keys.
- Every final row has exactly `category`, `status`, `review_reason`,
  `has_defect`, and `defect_fields`, matching the sample submission schema.
