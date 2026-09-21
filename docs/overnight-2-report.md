# Overnight improve-2 report

Date: 2026-09-22 (Asia/Singapore)

## Summary

In progress. Final results, recommended settings, retained changes, and user decisions will be added here after the overnight run.

## Guardrails and assumptions

- Branch: `overnight/improve-2`, created from `main` at `c52305a`.
- No push, merge, deployment, account creation, or modification of `main` is permitted.
- Scorer budget: 2/14 used; full OpenAI exports: 1/2 used.
- The task-specified interpreter path `backend.venv\Scripts\python.exe` does not exist. The repository venv exists at `backend\.venv\Scripts\python.exe`; all Python and scorer commands use that interpreter. The scorer command is otherwise unchanged.
- Runtime and output directories are fresh children of `C:\Users\User\monash-hackathon.runtime`.
- The scorer is used only on complete 520-entry exports. Only aggregate scorer output is recorded.
- When evidence is uncertain, the conservative outcome is `NEEDS_REVIEW`.

## Scored runs

| # | Step | Config | Final score | Stage 1 macro-F1 | Defect precision | Defect recall | End-to-end count | Flagged count |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 0 | Rules-only baseline | 0.6726 | 0.7229 | 1.0000 | 0.6087 | 28/46 | 57 |
| 2 | 0 | Full baseline, OpenAI enabled | 0.7012 | 0.8183 | 1.0000 | 0.6087 | 28/46 | 57 |

## Step 0 — Baseline

- Attempt 1 was rejected before scoring: the CLI default resolved to `C:\Users\User\data`, so the summary had `entries=0`. The failed output was not scored or reused.
- Rules-only attempt 2 explicitly set the repository data directory and completed with 520 entries. Category counts: BL comparison 129, invoice query 56, general 171, SI request 141, spam 23. It made zero LLM calls.
- The full baseline completed with 520 entries. Category counts: BL comparison 129, invoice query 77, general 135, SI request 141, spam 38. It made 75 provider calls, used 33,604 input tokens and 2,994 output tokens, had five in-run cache hits, and recorded no provider failures.
- Both baseline scores match the earlier reference values to four decimals. Defect precision is 1.0000, establishing the scorer veto floor for all later changes.

## Step 1 — Order-mode consignee policy

Pending.

## Step 2 — Draft-BL request rule

Pending.

## Step 3 — Persistent Stage 1 LLM cache

Pending.

## Step 4 — Field-state analysis and evidence-backed fixes

Pending.

## Step 5 — Hygiene and final verification

Pending.
