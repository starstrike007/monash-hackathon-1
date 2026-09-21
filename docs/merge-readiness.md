# Merge readiness

## Decision

Evaluator scores are currently unavailable. The permitted scorer command was run against each fresh submission, but the exact configured path did not exist:

```text
C:\Users\User\sdoc-eval\server\score_cli.py
```

The command failed before reading a submission. No answer key, external evaluation data, or files outside the explicitly permitted scorer path were inspected. Therefore this branch is not objectively certified safe to merge on score evidence. The provisional base is `overnight/phase-8` because it contains the requested Stage 2 parser and fallback work and passed its local gates; this is a code-review decision, not a score claim. After the general parser fixes and reliability work, a fresh candidate rules-only export matches the `main` local status counts and differs only in five conservative document-resolution review reasons.

## Step 0: repository state

- Comparison base: `main` at `ddd5afc`.
- `phase8-document-parsers` also points at `ddd5afc`.
- `overnight/phase-8` points at `98f307d`.
- `merge-candidate` was created from `overnight/phase-8` in the untracked runtime worktree under `.runtime/merge-readiness-20260921/`.
- The original working tree remained on `overnight/phase-8` and was not modified.
- No push, merge, deployment, account creation, or main-branch change was performed.

## Step 1: fresh export comparison

Each export used the project virtualenv, the repository `data` directory, `--rules-only`, and a new runtime/output directory. All three completed with 520 entries and zero export failures.

| version | run status | entries | OK | MISMATCH | NEEDS_REVIEW | evaluator score |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `main` | complete | 520 | 411 | 28 | 81 | unavailable |
| `phase8-document-parsers` | complete | 520 | 411 | 28 | 81 | unavailable |
| `overnight/phase-8` | complete | 520 | 407 | 32 | 81 | unavailable |
| `merge-candidate` | complete | 520 | 411 | 28 | 81 | unavailable |

Commands used (with the branch-specific working directory substituted for each comparison worktree):

```powershell
C:\Users\User\monash-hackathon\backend\.venv\Scripts\python.exe export_stage1.py --rules-only --data-dir C:\Users\User\monash-hackathon\data --runtime-dir C:\Users\User\monash-hackathon\.runtime\merge-readiness-20260921\<version>-runtime --output-dir C:\Users\User\monash-hackathon\.runtime\merge-readiness-20260921\<version>-output
$env:PYTHONIOENCODING='utf-8'; & C:\Users\User\monash-hackathon\backend\.venv\Scripts\python.exe C:\Users\User\sdoc-eval\server\score_cli.py C:\Users\User\monash-hackathon\.runtime\merge-readiness-20260921\<version>-output\submission.json --json
```

The first command completed for `main`, `phase8-document-parsers`, and `overnight/phase-8`. The second command failed identically because the scorer file was absent; no score fields are reported or inferred.

## Step 3 audit

The fresh local submissions differ in 19 records between the baseline and `overnight/phase-8`. The full field-level audit, including concise source evidence and locations, is in [regression-diff.md](regression-diff.md). The principal general patterns are:

1. Multiline DOCX table cells were flattened into a single field value, allowing address lines to contaminate party values.
2. A PDF header containing the words `GROSS WEIGHT` could be mistaken for a value label because label matching searched anywhere in a line.
3. Document-resolution changes are more conservative: wrong-type and unreadable candidates now remain explicit review cases rather than being treated as missing attachments.

The first two are addressed on this branch with synthetic parser tests. The third is retained as conservative review behavior and is not tuned to any record.

## Step 4: failure handling

Implemented and tested. `LLM_CONSECUTIVE_FAILURE_THRESHOLD` defaults to `5`; after that many consecutive connection/authentication failures, remaining unresolved classifications are emitted as `fallback_default` with reason `llm_unavailable` and no further provider calls. `LLM_DEGRADED_FAILURE_SHARE` defaults to `0.10`; a run is `degraded` only when the failure share is greater than that value. Connection, authentication, rate-limit, bad-request, and timeout failures have distinct safe reason codes. Mocked tests cover the reason-code mapping, circuit stop, skipped calls, and degraded run status.

## Step 5: real OpenAI verification

The final non-rules-only export without a candidate `.env` completed with 520 entries, `run_status=degraded`, `openai_configured=false`, 147 `llm_no_key` fallbacks, and zero provider calls. A switch-on export used a temporary ignored copy of the repository's existing `.env`; the copy was deleted in a `finally` block and no key content was printed. It completed with 520 entries and `run_status=degraded`: 8 logical classification calls, 24 provider attempts, 28 bounded retries including Stage 2, 147 model failures, 139 circuit-open `llm_unavailable` fallbacks, 6 Stage 2 calls, 6 Stage 2 errors, and zero reported tokens. The provider path did not produce a usable model result, so the fallback remains off by default. No additional full exports will be run.

## Step 6: hygiene and final verification

The final commands and hygiene results are recorded in `docs/overnight-log.md`. The candidate rules-only export completed with 520 entries, `run_status=complete`, and counts 411 OK, 28 MISMATCH, and 81 NEEDS_REVIEW. The full pytest and final diff checks are complete. The exact scorer command was attempted against fresh comparison outputs but cannot run because the permitted scorer file is missing.

## Unfinished / blockers

- Aggregate score, Stage 1 macro-F1, Stage 3 precision/recall, end-to-end count, and evaluator review count are unavailable because the exact permitted scorer path is missing.
- Real-provider scoring is not established; the provider was unavailable and no tokens were reported.
- The final recommendation must remain conditional until the scorer is restored and a fresh 520-entry submission is scored.
