# Overnight run log

Summary: Completed the unattended run on `overnight/phase-8`, created from
`phase8-document-parsers`. The existing local `overnight` branch was
preserved as `overnight-base` because Git cannot create a child ref while a
branch uses the parent name. Step 1, Step 2, and Step 3 are committed as
`68b0597`, `5ea0b5e`, and `753fa55`. No remote, main branch, deployment,
account, or prohibited evaluator data was touched.

Final verification commands and results:

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m pytest -q
$env:STAGE2_LLM_FALLBACK='0'; .\.venv\Scripts\python.exe export_stage1.py --rules-only --runtime-dir ..\.runtime\overnight-final-rules --output-dir ..\.runtime\overnight-final-rules-output
$env:STAGE2_LLM_FALLBACK='0'; .\.venv\Scripts\python.exe export_stage1.py --runtime-dir ..\.runtime\overnight-final-full --output-dir ..\.runtime\overnight-final-full-output
```

- Pytest: 51 passed, 1 existing non-strict xfail, 2 warnings.
- Final rules-only export: 520 entries, `run_status=complete`, zero
  failures, zero provider calls.
- Final full export: 520 entries and `run_status=complete`; 147 logical
  provider calls made 441 bounded attempts (294 retries), all ending in
  `llm_error`, with zero reported tokens. The export file was generated, but
  the provider-backed classification result is not reliable until the
  OpenAI connectivity/configuration issue is resolved. No second full export
  was started.

Baseline `pytest -q` from `backend/`
passed 41 tests with 3 existing non-strict xfails and 2 dependency warnings.
The allowed corpus profile is 520 emails and 250 referenced attachments:
192 TXT, 22 XLSX, 8 DOCX, and 28 PDF. Nine PDFs are currently unreadable.

## Step 1 — Stage 2 document parsing

- Attempt 1: inspected the existing parser, extractor, normalizer,
  orchestrator, schemas, tests, dependencies, and allowed attachment corpus.
  Existing DOCX/XLSX locations were row-level only, TXT had no structured
  rows, PDF readability was only a non-empty-text check, and Stage 2's LLM
  hook was not environment-gated. No code changed yet.
- Checks: baseline `.venv\\Scripts\\python.exe -m pytest -q` from `backend/`.
- Result: 41 passed, 3 xfailed, 2 warnings.
- Corpus observations: formats and CJK labels were counted without reading
  prohibited evaluator data. The observed CJK field labels are `发货人`,
  `收货人`, `通知人`, `装货港`, `卸货港`, `箱数`, and `毛重`. `提单号` was
  observed but is not one of the seven canonical comparison fields.
- Assumption: malformed, empty-text, or text-layer-garbled PDFs are
  conservatively unreadable and route to review; no vision fallback is added.
- Implementation: added a shared structured representation for TXT, PDF,
  DOCX, and XLSX; PDF text/table parsing with a conservative garble check;
  DOCX paragraphs/tables; XLSX all-sheet rows with cell coordinates; explicit
  missing-attachment errors; and a corpus-scoped field-label alias config.
  The alias config includes the observed CJK labels and does not add
  `提单号`, because it is not one of the seven canonical fields.
- Synthetic checks: `.venv\\Scripts\\python.exe -m pytest tests/test_stage2_parsers.py -q`
  -> 4 passed.
- Gate checks: `.venv\\Scripts\\python.exe -m pytest -q` -> 47 passed, 1
  existing non-strict xfail, 2 warnings. `git diff --check` passed.
- Gate export: `.venv\\Scripts\\python.exe export_stage1.py --rules-only
  --runtime-dir ..\\.runtime\\overnight-step1 --output-dir
  ..\\.runtime\\overnight-step1-output` -> completed with 520 entries,
  run status `complete`, zero failures, and zero LLM calls. No real OpenAI
  usage was consumed.
- Unfinished at this step: the existing model-timeout xfail remains for later
  reliability work; Stage 2 analysis and the environment-gated text fallback
  are still pending.

## Step 2 — Stage 2 analysis

- Attempt 1: ran a rules-only in-memory pass over all allowed inbox records
  and attachments, then wrote `docs/stage2-analysis.md`. No pipeline fixes
  were made in this step.
- Checks: analysis counters reconciled to 153 `BL_COMPARISON` emails and
  `git diff --check` passed.
- Result: 113 emails had exactly one readable SI and BL; format pairings,
  81 review cases by reason, unavailable-field counts, and the intentionally
  unmapped label list are documented. No evaluator or scoring command was
  used.
- Assumption: the analysis uses the rules-only category set so it is
  repeatable offline; “supported pair” requires exactly one readable,
  content-identified SI and BL, not filename inference.

## Step 3 — Stage 2 text fallback

- Attempt 1: added `STAGE2_LLM_FALLBACK`, default `false`; added the versioned
  `extract_v1` prompt and strict seven-field structured output; validated model
  values against Unicode-aware source text before accepting them; tagged
  accepted fields `source=llm`; and recorded extraction input/output/reasoning
  tokens in document and run metrics. Provider errors leave fields unresolved.
- Checks: `.venv\\Scripts\\python.exe -m pytest tests/test_stage2_fallback.py
  -q` -> 4 passed; `.venv\\Scripts\\python.exe -m pytest -q` -> 51 passed,
  1 existing non-strict xfail, 2 warnings.
- Mocked safety checks: the switch-off path makes no fallback call; a
  source-supported proposal is accepted and token usage is recorded; invented
  values are rejected; an incomplete SI/BL pair remains `NEEDS_REVIEW` with
  no defect fields.
- Export gate, switch off:
  `$env:STAGE2_LLM_FALLBACK='0'; .\\.venv\\Scripts\\python.exe
  export_stage1.py --rules-only --runtime-dir ..\\.runtime\\overnight-step3-off
  --output-dir ..\\.runtime\\overnight-step3-off-output` -> 520 entries,
  complete, zero failures, zero LLM calls.
- Export gate, switch on:
  `$env:STAGE2_LLM_FALLBACK='1'; .\\.venv\\Scripts\\python.exe
  export_stage1.py --rules-only --runtime-dir ..\\.runtime\\overnight-step3-on
  --output-dir ..\\.runtime\\overnight-step3-on-output` -> 520 entries,
  complete, zero failures, zero LLM calls. The switch was exercised without
  real provider usage because `--rules-only` intentionally disables the
  classifier/provider path.
- Assumption: a provider response with no usage object records no non-zero
  token total rather than estimating tokens. No vision fallback was added.

## Final verification

- Completed. The exact commands and results are recorded at the top of this
  log. The remaining unfinished item is the provider-backed full-export
  failure described above; rules-only and mocked Stage 2 paths pass.
