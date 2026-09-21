# Overnight improve-2 report

Date: 2026-09-22 (Asia/Singapore)

## Summary

In progress. Final results, recommended settings, retained changes, and user decisions will be added here after the overnight run.

## Guardrails and assumptions

- Branch: `overnight/improve-2`, created from `main` at `c52305a`.
- No push, merge, deployment, account creation, or modification of `main` is permitted.
- Scorer budget: 8/14 used; full OpenAI exports: 2/2 used.
- The task-specified interpreter path `backend.venv\Scripts\python.exe` does not exist. The repository venv exists at `backend\.venv\Scripts\python.exe`; all Python and scorer commands use that interpreter. The scorer command is otherwise unchanged.
- Runtime and output directories are fresh children of `C:\Users\User\monash-hackathon.runtime`.
- The scorer is used only on complete 520-entry exports. Only aggregate scorer output is recorded.
- When evidence is uncertain, the conservative outcome is `NEEDS_REVIEW`.

## Scored runs

| # | Step | Config | Final score | Stage 1 macro-F1 | Defect precision | Defect recall | End-to-end count | Flagged count |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | Rules-only baseline | 0.6726 | 0.7229 | 1.0000 | 0.6087 | 28/46 | 57 |
| 2 | 0 | Full baseline, OpenAI enabled | 0.7012 | 0.8183 | 1.0000 | 0.6087 | 28/46 | 57 |
| 3 | 1 | `ORDER_MODE_POLICY=review`, rules-only | 0.6726 | 0.7229 | 1.0000 | 0.6087 | 28/46 | 57 |
| 4 | 1 | `ORDER_MODE_POLICY=same_party_match`, rules-only | 0.9038 | 0.7229 | 1.0000 | 0.9783 | 45/46 | 19 |
| 5 | 1 | `ORDER_MODE_POLICY=always_mismatch`, rules-only | 0.7145 | 0.7229 | 0.6818 | 0.9783 | 31/46 | 19 |
| 6 | 2 | Draft-BL rule on, rules-only | 0.6726 | 0.7229 | 1.0000 | 0.6087 | 28/46 | 57 |
| 7 | 2 | Draft-BL rule off, rules-only | 0.6726 | 0.7229 | 1.0000 | 0.6087 | 28/46 | 57 |
| 8 | 2 | Draft-BL rule off, full OpenAI | 0.7172 | 0.8715 | 1.0000 | 0.6087 | 28/46 | 100 |

## Step 0 — Baseline

- Attempt 1 was rejected before scoring: the CLI default resolved to `C:\Users\User\data`, so the summary had `entries=0`. The failed output was not scored or reused.
- Rules-only attempt 2 explicitly set the repository data directory and completed with 520 entries. Category counts: BL comparison 129, invoice query 56, general 171, SI request 141, spam 23. It made zero LLM calls.
- The full baseline completed with 520 entries. Category counts: BL comparison 129, invoice query 77, general 135, SI request 141, spam 38. It made 75 provider calls, used 33,604 input tokens and 2,994 output tokens, had five in-run cache hits, and recorded no provider failures.
- Both baseline scores match the earlier reference values to four decimals. Defect precision is 1.0000, establishing the scorer veto floor for all later changes.

## Step 1 — Order-mode consignee policy

Evidence review completed before implementation. The problem statement does not state a legal rule for named-versus-order-mode consignees; it says insufficient evidence should be escalated. Fifteen raw SI/BL pairs were inspected directly. Thirteen printed the same party with order mode on exactly one document; two printed different parties.

| Case | SI raw consignee | BL raw consignee | Finding |
| --- | --- | --- | --- |
| `email_004` | EAST BRIGHT FZ-LLC | To the Order of UAB NOVAKOPA | Different party |
| `email_032` | TOPKOPY MIDDLE EAST FZE | To the Order of TOPKOPY MIDDLE EAST FZE | Same party |
| `email_040` | TOPKOPY MIDDLE EAST FZE | To the Order of TOPKOPY MIDDLE EAST FZE | Same party |
| `email_052` | BALL & DOGGETT AUSTRALIA PTY LTD | To the Order of BALL & DOGGETT AUSTRALIA PTY LTD | Same party |
| `email_065` | INTERNATIONAL FOREST PRODUCTS LLC | To the Order of INTERNATIONAL FOREST PRODUCTS LLC | Same party |
| `email_068` | PACIFIC OFFICE (M) SDN BHD | To the Order of PACIFIC OFFICE (M) SDN BHD | Same party |
| `email_091` | To the Order of ORIENT LINKS CO (LLC) | ORIENT LINKS CO (LLC) | Same party |
| `email_096` | 3S PAPER PRODUCTS SDN BHD | To the Order of 3S PAPER PRODUCTS SDN BHD | Same party |
| `email_107` | KTP CO., LTD | To the Order of VITAL SOLUTIONS PTE. LTD. | Different party; XLSX/DOCX pair |
| `email_113` | CERIEX | To the Order of CERIEX | Same party |
| `email_128` | To the Order of BALL & DOGGETT AUSTRALIA PTY LTD | BALL & DOGGETT AUSTRALIA PTY LTD | Same party |
| `email_133` | To the Order of MOORIM SP CO., LTD | MOORIM SP CO., LTD | Same party |
| `email_146` | To the Order of SAFQA LIMITED | SAFQA LIMITED | Same party |
| `email_174` | To the Order of TOAN LUC PAPER JOINT STOCK COMPANY | TOAN LUC PAPER JOINT STOCK COMPANY | Same party |
| `email_198` | To the Order of UAB NOVAKOPA | UAB NOVAKOPA | Same party |

Implemented documented `ORDER_MODE_POLICY` values with `review` retained as the default. Party equality uses only the existing deterministic legal-suffix normalization; no fuzzy matching is used.

- `review`: keeps the current conservative escalation. Risk: high false-alarm workload when the named party is identical, but no legal-semantic difference is silently approved.
- `same_party_match`: treats equal normalized parties as a match and different parties as a consignee mismatch. Risk: the same printed party may still represent a meaningful negotiability change that the name comparison cannot capture.
- `always_mismatch`: treats any named/order-mode difference as a consignee defect. Risk: maximizes detection but creates defects for formatting/negotiability differences even when the party is identical.

Policy results:

| Policy | Final score | Defect precision | NEEDS_REVIEW | Consignee defects | Outcome |
| --- | ---: | ---: | ---: | ---: | --- |
| `review` | 0.6726 | 1.0000 | 57 | 5 | Safe default retained |
| `same_party_match` | 0.9038 | 1.0000 | 19 | 8 | Best score; recommended if the business accepts the negotiability risk |
| `always_mismatch` | 0.7145 | 0.6818 | 19 | 45 | Vetoed: defect precision fell below the 1.0000 baseline |

Recommendation: `same_party_match` is the measured best policy and preserves defect precision, but changing the default requires a business decision because identical party text does not prove that named and order-mode consignees are legally interchangeable. The code default remains `review` exactly as requested.

## Step 2 — Draft-BL request rule

Implemented `DRAFT_BL_REQUEST_RULE_ENABLED`, defaulting to `true` to preserve current behavior. When disabled, a draft-BL send/provide/share/forward request without explicit comparison intent is left unresolved: rules-only mode uses the conservative `GENERAL` fallback, while a full run routes it to the Stage 1 LLM. Synthetic coverage verifies all three paths.

Results:

- Rule enabled, rules-only: 440 rule decisions and 80 conservative fallbacks; 57 `NEEDS_REVIEW`; final 0.6726.
- Rule disabled, rules-only: 349 rule decisions and 171 conservative fallbacks; the exported categories and 57 `NEEDS_REVIEW` rows are unchanged, so the score remains 0.6726.
- Rule disabled, full OpenAI: 349 rule decisions and 171 LLM decisions. The run made 166 provider calls with five in-run cache hits, 75,532 input tokens, 6,637 output tokens, no retries, and no failures. It classified 43 additional emails as BL comparison, raising `NEEDS_REVIEW` from 57 to 100. Stage 1 macro-F1 improved from the full baseline's 0.8183 to 0.8715 and final score improved from 0.7012 to 0.7172; defect precision remained 1.0000, but review precision fell because of the larger queue.

Recommendation: retain the enabled default for the product because it avoids 43 additional review cases and 91 extra LLM-eligible inputs. Disable it only when official-score optimization outweighs review workload and model cost; that measured configuration has the best Step 2 final score. The default remains enabled as requested.

## Step 3 — Persistent Stage 1 LLM cache

Implemented a versioned JSON cache for validated Stage 1 LLM decisions. The existing key includes normalized subject/body, prompt version and fingerprint, model ID, and normalized attachment metadata; sender and email ID are excluded. Writes use an atomic temporary-file replacement. Provider failures are not cached. `IGNORE_STAGE1_LLM_CACHE=true` bypasses both reads and writes. Tests use `tmp_path` to prove a second service instance reuses the first decision without a provider call and that ignore mode calls the provider instead.

No full export was run for this step because the two-export OpenAI cap was exhausted in Steps 0 and 2.

The disk cache is injected only at the application/export orchestration boundary. Standalone classifier instances remain memory-only unless given an explicit cache path, preventing shared-cache contamination in tests. Full backend check: 79 passed, 1 xfailed, 2 xpassed.

## Step 4 — Field-state analysis and evidence-backed fixes

Pending.

## Step 5 — Hygiene and final verification

Pending.
