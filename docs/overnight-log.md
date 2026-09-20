# Overnight run log

Summary: Started the unattended run on `overnight/phase-8`, created from
`phase8-document-parsers`. The existing local `overnight` branch was
preserved as `overnight-base` because Git cannot create a child ref while a
branch uses the parent name. No remote, main branch, deployment, account, or
prohibited evaluator data was touched.

Current state: Step 1 passed and is committed as `PENDING COMMIT` below.
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

Not started.

## Step 3 — Stage 2 text fallback

Not started. The fallback will default off and will be tested with a mocked
client before any real full export.

## Final verification

Not started.
