# UX audit — `ux-changes`

Audit date: 2026-09-21 13:30 Asia/Singapore

This audit was performed before the fixes in this working session. The worktree
was clean at the start and the active branch was `ux-changes`.

## Verification limits and baseline evidence

- Backend regression baseline: `50 passed, 3 xfailed` (`backend/.venv/Scripts/python.exe -m pytest -q`).
- Frontend baseline: `npm run build` passed after allowing Vite/esbuild to spawn outside the default sandbox.
- Direct-load baseline: `GET` requests to `/dashboard`, `/inbox`, `/inbox/email_001`, `/docs-comparison`, `/docs-comparison/email_001`, `/review`, and `/review/no-item` all returned the Vite shell with HTTP 200.
- A browser/Playwright surface was not available in this environment (`cua.listBrowsers()` returned `[]`; Playwright and Vitest are not installed). Screen interaction items are therefore marked partial when source/API verification could not replace a click-through.
- The running API on port 8000 returned 520 emails and a 520-entry export, but its seeded store had `received_at: null` and `/api/review/items` returned 404, so it was not treated as proof that the current branch's review UI works end to end.
- A fresh rules-only export used a new runtime/output directory under `.runtime/`, completed with 520 entries and `run_status=complete`, and made zero OpenAI calls. Location coverage was 1,658/1,750 fields (94.74%): TXT 1,315/1,344, XLSX 154/154, DOCX 56/56, PDF 133/196.
- The allowed evaluator command was attempted against that fresh submission, but `C:\Users\User\sdoc-eval\server\score_cli.py` was not present. No ground-truth data was read and no score is reported.

## Pre-fix checklist

Status meanings: PASS is implemented and verified; PARTIAL is present but incomplete or not exercisable in this environment; MISSING is absent or contradicted by the current behavior.

### Global

1. **PARTIAL — Sidebar and live badge.** `src/components/layout/AppShell.jsx:6-10,65-86` has exactly the four requested navigation entries and a badge; `src/app/router.jsx:37-47` fetches the count once. The badge is not refreshed after an override/resolution and starts from a hard-coded `14`. Verified by reading code only.
2. **PASS — Direct-load routes.** `src/app/router.jsx:18-32` defines all seven requested routes. Direct HTTP checks against the Vite dev server returned 200 for every route, including refresh-style detail paths.
3. **PARTIAL — Prototype visual language.** `src/index.css:1-43` and `src/components/layout/AppShell.jsx:22,41` use the requested fonts, ground, ink, teal, and navy/sidebar treatment; no browser screenshot was available to verify the rendered match.
4. **PARTIAL — Effective dashboard values.** `backend/app/services/dashboard_service.py:72-104` counts raw stored result categories/statuses, while `to_email_item` applies an override at `:39-58`. Existing override tests cover export/list behavior, but dashboard aggregation is not explicitly based on effective categories. Verified by code and backend tests.
5. **PARTIAL — Pipeline failures and Retry.** `src/features/pipeline-run/PipelineRunDrawer.jsx:75-128` renders failures and calls `retryEmail`, but only the first failure is used and the UI has no visible failure state if the request itself fails. Read code only.
6. **MISSING — No silent mock fallback.** `src/lib/api.js:1-128` imports `mockData` and `withFallback` returns mock dashboard, emails, details, runs, retries, and resolutions after any fetch error. Confirmed by source inspection.

### Stage 1 — Inbox

1. **PARTIAL — Date groups and newest-first order.** `src/features/inbox/InboxPage.jsx:18-59,109-146` calculates the five buckets and sorts each bucket, but only renders non-empty buckets; the live store inspected through port 8000 had null timestamps, so the dataset was not actually grouped at runtime.
2. **PARTIAL — Deterministic simulated time and rebase.** `backend/app/services/timestamps.py:27-64` provides deterministic Asia/Kuala_Lumpur business-hour timestamps and `backend/app/api/routes/admin.py:10-18` exposes rebase, but existing seeded records were missing metadata and `src/lib/types.js:39-47` falls back to a fake date when absent. Code plus API inspection.
3. **PASS — Longer subjects.** `src/features/inbox/InboxPage.jsx:127-130` uses a two-line clamp rather than one-line truncation. Verified by source/build.
4. **PASS — No Status or What-needs-attention columns.** The Inbox row grid at `src/features/inbox/InboxPage.jsx:117-142` contains ID/time, subject/sender, category, and attachment count only. Verified by source/build.
5. **PARTIAL — Category chips/counts and search.** `src/features/inbox/InboxPage.jsx:9-16,45-49,82-106` has all chips and search, but counts are derived from the currently filtered response, so selecting one category makes the other counts zero. Source inspection.
6. **PASS — Attachment icon/count.** `src/features/inbox/InboxPage.jsx:138-141` renders a paperclip and attachment count, backed by `backend/app/services/dashboard_service.py:20-29`. Source plus API inspection.
7. **PARTIAL — Email detail.** `src/features/inbox/InboxDetailPage.jsx:129-179` renders sender, received time, full body, and per-attachment view/download controls. It has no fetch error state and could not be clicked through without a browser.
8. **PARTIAL — Category override/revert/ripple.** `src/features/inbox/InboxDetailPage.jsx:182-209` wires the dropdown/revert and `backend/app/services/override_service.py:22-89` reprocesses the email; UI errors are swallowed by an unhandled promise. Backend fixture tests exercise the override path, but not the browser flow.
9. **PASS — Override away closes reviews and removes comparison.** `backend/app/services/override_service.py:62-72` saves a non-comparison result and calls `close_reviews_for_reclassify`; the existing override regression test verifies the fixture behavior. Test verified.
10. **PARTIAL — Machine label and audit log.** `backend/app/pipeline/orchestrator.py:215-228` preserves `category_machine` and `backend/app/services/override_service.py:80-87` appends an audit entry; no API or UI exposed the history and the live store used for inspection had no audit entries. Code/test inspection.
11. **PARTIAL — State-aware summary/deep links.** `src/features/inbox/InboxDetailPage.jsx:13-57` provides status-aware copy and links, but the review lookup has no error handling and the route was not clicked through.

### Stage 2 — Extraction

1. **PASS — Extraction method is not shown on normal Inbox screens.** Inbox detail shows classification provenance at `src/features/inbox/InboxDetailPage.jsx:154-157`; extraction source rows are confined to the collapsed Docs Comparison decision section at `src/features/docs-comparison/DocsComparisonDetailPage.jsx:84-137`.
2. **PARTIAL — Field locations and coverage.** Parser/extractor plumbing exists at `backend/app/adapters/document_parsers.py:21-25,49-188` and `backend/app/pipeline/extract.py:64-147`, and the fresh export measured 94.74% location coverage. PDF unreadable/scanned fields still lack a dependable quoted location and DOCX paragraph locations are not carried through the schema.

### Stage 3 — Docs Comparison

1. **PARTIAL — List, filters/counts, search, effective category.** `src/features/docs-comparison/DocsComparisonListPage.jsx:22-38` requests the comparison category and has status/search controls, but chip counts are calculated from the active response rather than an unfiltered comparison set.
2. **PARTIAL — State banner and seven-field table.** `src/features/docs-comparison/DocsComparisonDetailPage.jsx:17-79,195-227` renders the banner and comparison rows with raw/normalized values, but normalized values are unlabeled and loading/fetch errors can leave a blank/skeleton state.
3. **PARTIAL — Pinpoint side-by-side viewer.** `src/features/docs-comparison/DocsComparisonDetailPage.jsx:220-244` passes evidence into both viewers, and `src/components/document-viewer/DocumentViewer.jsx:40-244` supports TXT/PDF/XLSX/DOCX highlights. At desktop the layout is stacked (`xl:grid-cols-1`), DOCX paragraph locations are not preserved, and no browser click-through was possible.
4. **PARTIAL — Full view/download.** `src/components/document-viewer/DocumentViewer.jsx:9-37` and `backend/app/api/routes/attachments.py:53-78` provide original downloads and inline viewing, but corrupt XLSX/DOCX/view parsing is not broadly converted to a clean API error.
5. **PARTIAL — Scanned PDF image/quoted callout.** `src/components/document-viewer/DocumentViewer.jsx:63-129` avoids fabricating a bbox and supports quoted text, but unreadable/scanned extraction does not reliably provide a quoted callout.
6. **PASS — Collapsed decision section.** `src/features/docs-comparison/DocsComparisonDetailPage.jsx:84-137` implements the collapsed “How this was decided” section.
7. **MISSING — Corrupt/unreadable attachments never cause 500/blank.** `backend/app/api/routes/attachments.py:19-29` only catches `FileNotFoundError` and `ValueError`; parser exceptions from corrupt XLSX/DOCX can escape as 500.

### Stage 4 — Review queue

1. **PARTIAL — Oldest-first list, reason filter, open/resolved toggle.** `src/features/review-queue/ReviewQueuePage.jsx:17-47,58-97` implements all controls and sorting, but fetch failures are not surfaced and counts only reflect the loaded filter.
2. **PARTIAL — Plain-language detail/evidence viewer.** `src/features/review-queue/ReviewItemDetailPage.jsx:289-362` has explanation and two viewers, but passes `location={null}` so the evidence is not pinpointed.
3. **PARTIAL — Unreadable/low-confidence confirm/correct.** `ReviewItemDetailPage.jsx:13-90,320-328` and `review_item_service.py:36-53` support confirm/correct, but the backend mutates a saved comparison directly rather than marking a human extraction and rerunning compare/decide; no low-confidence reason exists.
4. **MISSING — Missing-value confirm-absent action.** The UI only offers confirm/correct and the schema only permits `confirm`/`correct`; there is no explicit “absent counts as discrepancy” action.
5. **PARTIAL — Missing attachment actions.** Reclassify and copy-draft are implemented at `ReviewItemDetailPage.jsx:332-344`, but the UI explicitly says upload is unavailable and no upload endpoint exists.
6. **PARTIAL — Wrong document type actions.** `ReviewItemDetailPage.jsx:329-331` and `review_item_service.py:69-91` support role reassignment, but there is no “mark a document missing” action.
7. **PARTIAL — Processing failure retry.** `review_item_service.py:93-100` and `ReviewItemDetailPage.jsx:218-240` wire retry, but the failure is not fully exercised and request errors are not rendered.
8. **MISSING — Resolve persistence/recompute/audit contract.** `backend/app/services/review_service.py:23-73` changes the stored comparison in place, does not set source to `human`, does not rerun the pipeline compare/decide path, and audit entries have no evidence payload.
9. **PARTIAL — Internal-to-export reason mapping.** `backend/app/services/review_queue_service.py:8-33` maps `processing_failed` to `unreadable`; the four evaluator reasons pass through. There is no `low_confidence` internal reason. The mapping is documented in README but not surfaced in the UI.

### Data and tests

1. **PASS — Additive migration exists.** `supabase/migrations/002_review_location_audit.sql:1-53` adds provenance/override/location columns and review/audit tables without dropping tables or columns.
2. **PARTIAL — Required regression coverage.** Location, override ripple, review resolution, effective export, and deterministic timestamp tests exist and pass in the backend suite; there are no frontend interaction tests, upload tests, or evidence-location assertions for all viewer formats.
3. **MISSING — Before/after self-eval score.** A fresh before export exists, but the requested evaluator executable is absent in this workspace and no Docker scoring endpoint is configured, so no score can be truthfully reported.

## Baseline totals

PASS: **8**
PARTIAL: **25**
MISSING: **5**

The fixes below are applied in the task's priority order. Each group is followed
by the narrowest available verification; the final section records remaining
verification limits and the post-fix totals.

## Post-fix checklist

The implementation changes were made in the same working tree after the
baseline above. The post-fix status is based on the checks named below; a
browser click-through was still unavailable.

### Global

1. **PASS — Sidebar and live badge.** `src/components/layout/AppShell.jsx:6-13,65-85` keeps exactly Dashboard, Inbox, Docs Comparison, and Review queue. `src/app/router.jsx:37-58` refreshes the open count on load and after `clearance:data-changed`; the fixture HTTP run returned the live open count.
2. **PASS — Direct-load routes.** `src/app/router.jsx:18-32` still defines all seven routes. Vite HTTP checks returned 200 for every requested path after the final build.
3. **PARTIAL — Prototype visual language.** The requested design tokens remain in `src/index.css` and `src/components/layout/AppShell.jsx`, but no browser surface was available for screenshot/click verification (`cua.listBrowsers()=[]`; Playwright/Vitest are not installed).
4. **PASS — Effective dashboard values.** `backend/app/services/dashboard_service.py:77-111` aggregates from effective `EmailListItem` values; the added dashboard override regression test verifies the category count ripple. Export/list behavior is also covered.
5. **PARTIAL — Pipeline failures and Retry.** `src/features/pipeline-run/PipelineRunDrawer.jsx:77-185` now renders every failure, has per-item Retry, and shows API errors. The backend retry path is covered by `test_processing_failure_stays_retryable_for_one_email`; the drawer click itself could not be exercised without a browser.
6. **PASS — No silent mock fallback.** `src/lib/api.js:1-45` contains direct API requests and a visible `ApiError`; `src/lib/mockData.js` and all fallback imports were removed. `src/components/BackendError.jsx` renders the recovery state.

### Stage 1 — Inbox

1. **PASS — Date groups and newest-first order.** `src/features/inbox/InboxPage.jsx` renders all five buckets and sorts descending. The ID-ordered schedule places EM-0001 in Today, EM-0002–0003 in Yesterday, EM-0004–0006 in This week, EM-0007–0010 in This month, and EM-0011–0520 in Earlier.
2. **PASS — Deterministic simulated time and daily rebase.** `backend/app/services/timestamps.py` derives business-hour timestamps from the numeric email ID and automatically rebases all records when the Asia/Kuala_Lumpur calendar date changes. `backend/app/api/routes/admin.py:11-18` still supports an immediate manual rebase, and `src/lib/time.js` formats the stored value without a fake default.
3. **PASS — Longer subjects.** `src/features/inbox/InboxPage.jsx:145-151` uses a two-line clamp.
4. **PASS — No Status or attention columns.** `src/features/inbox/InboxPage.jsx:143-166` contains only ID/time, subject/sender, category, and attachment count.
5. **PASS — Category chips/counts and search.** `src/features/inbox/InboxPage.jsx:11-19,44-78,108-132` fetches all pages, computes global chip counts, and filters by the API-backed subject/sender/ID query.
6. **PASS — Attachment icon/count.** `src/features/inbox/InboxPage.jsx:162-165` and `backend/app/services/dashboard_service.py:17-53` provide the count from real attachment metadata, including reviewer uploads.
7. **PASS — Email detail.** `src/features/inbox/InboxDetailPage.jsx:14-57,103-238` renders sender/time, full subject/body, attachment view/download, classification provenance, and a visible API error state. Fixture HTTP/API tests exercised the detail data.
8. **PASS — Category override/revert/ripple.** `src/features/inbox/InboxDetailPage.jsx:103-131,208-226` handles saving/errors; `backend/app/services/override_service.py` reprocesses and records history. Existing override tests plus the new audit assertion pass.
9. **PASS — Override away closes reviews/removes comparison.** `backend/app/services/override_service.py:60-72` and the existing fixture regression test verify this path.
10. **PASS — Machine label and audit log.** `backend/app/pipeline/orchestrator.py:225-246` preserves the machine category; the override and review services append audit entries, with evidence for review changes. The new test asserts an override audit row.
11. **PASS — State-aware summary/deep links.** `src/features/inbox/InboxDetailPage.jsx:14-57,231-238` links clean, mismatch, and review cases to the appropriate detail/review route and displays lookup errors.

### Stage 2 — Extraction

1. **PASS — Extraction method hidden on normal screens.** `src/features/inbox/InboxDetailPage.jsx:154-158` only shows classification provenance; extraction sources are in the collapsed section at `src/features/docs-comparison/DocsComparisonDetailPage.jsx:84-137`.
2. **PARTIAL — Field locations and coverage.** `backend/app/adapters/document_parsers.py` and `backend/app/pipeline/extract.py` carry page/line/sheet/cell/table/paragraph/bbox/quoted evidence. The final dataset measurement is 1,658/1,750 fields (94.74%) across all states, with 1,654/1,654 readable/found values (100%) located. Missing/unreadable values cannot have a dependable pinpoint without fabricated evidence.

### Stage 3 — Docs Comparison

1. **PASS — List, filters/counts/search/effective category.** `src/features/docs-comparison/DocsComparisonListPage.jsx:18-55,90-157` requests only effective Document comparison items and computes status counts over the unfiltered response.
2. **PASS — State banner and seven-field table.** `src/features/docs-comparison/DocsComparisonDetailPage.jsx:17-83,207-238` renders all seven fields, explicit normalized/raw values, uncertain styling, and fetch/review error states.
3. **PARTIAL — Pinpoint side-by-side viewer.** `src/features/docs-comparison/DocsComparisonDetailPage.jsx:245-270` now keeps both viewers side by side at desktop, and `src/components/document-viewer/DocumentViewer.jsx:39-256` supports TXT/PDF/XLSX/DOCX evidence highlighting. Parser location tests cover TXT, PDF, XLSX, and DOCX; browser click-through on all four formats was unavailable.
4. **PASS — Full view/download.** `src/components/document-viewer/DocumentViewer.jsx:9-37` and `backend/app/api/routes/attachments.py:15-82` serve the original and inline views. The upload regression test also verifies an uploaded attachment can be viewed and downloaded.
5. **PARTIAL — Scanned PDF image/quoted callout.** `src/components/document-viewer/DocumentViewer.jsx:63-89` renders the page image, shows a no-text-layer callout for `readable === false`, and never invents a bbox. The corrupt/unreadable API test verifies a clean response; no browser screenshot was possible.
6. **PASS — Collapsed decision section.** `src/features/docs-comparison/DocsComparisonDetailPage.jsx:84-137` implements it.
7. **PASS — Corrupt/unreadable attachments.** `backend/app/api/routes/attachments.py:27-82` converts parser/render failures to clean 404/415/422 responses; `test_unreadable_attachment_view_is_a_clean_response` passes.

### Stage 4 — Review queue

1. **PASS — Oldest-first list, filters, toggle, and error state.** `src/features/review-queue/ReviewQueuePage.jsx:17-58,75-161` provides the controls and visible retry state; fixture HTTP/API checks cover queue population.
2. **PASS — Plain-language detail/evidence viewer.** `src/features/review-queue/ReviewItemDetailPage.jsx:392-551` selects a flagged field and passes SI/BL evidence into both viewers.
3. **PASS — Unreadable/low-confidence confirm/correct.** `src/features/review-queue/ReviewItemDetailPage.jsx:14-121,404-413` supplies all seven field choices even when an unreadable result has no comparisons; `backend/app/services/review_service.py:29-151` stores a human source and recomputes. No separate `low_confidence` review reason is emitted by the current pipeline.
4. **PASS — Missing-value confirm-absent.** `ReviewAction.CONFIRM_ABSENT`, `ReviewItemResolveRequest`, and `review_service.py` record absence as a mismatch; `test_confirm_absent_is_a_human_mismatch_and_audited` passes.
5. **PASS — Missing-attachment actions.** `src/features/review-queue/ReviewItemDetailPage.jsx:128-242` provides upload, reclassify, and copy-draft actions. `backend/app/services/review_item_service.py:29-120` stores an upload under the isolated runtime, attaches it, reruns, and logs evidence; the upload test passes.
6. **PARTIAL — Wrong-document-type actions.** `src/features/review-queue/ReviewItemDetailPage.jsx:254-372` now supports role reassignment and path-specific mark-missing; `review_item_service.py:124-199` reruns and audits both. No representative wrong-document fixture was available in the fast HTTP smoke run, and no browser was available for the action click-through.
7. **PARTIAL — Processing failure retry.** `PipelineOrchestrator.ensure_seeded` now preserves a failed run with no result, and the API regression test creates a synthetic failure then retries that one email successfully. The drawer click remains covered by the global browser limitation.
8. **PASS — Resolve persistence/recompute/audit.** `backend/app/services/review_service.py:29-151` applies human source/confidence/evidence, runs the normal compare/decide gates, increments version, synchronizes the queue, and appends before/after evidence. Resolution and upload tests pass.
9. **PASS — Internal-to-export mapping.** `backend/app/services/review_queue_service.py:8-33` maps `unreadable -> unreadable`, `missing_attachment -> missing_attachment`, `missing_value -> missing_value`, `wrong_doc_type -> wrong_doc_type`, and `processing_failed -> unreadable`. There is no `low_confidence` internal reason.

### Data and tests

1. **PASS — Additive migrations.** `supabase/migrations/002_review_location_audit.sql` and `003_review_uploads.sql` add location/audit/review and upload columns/tables; `004_human_review_compatibility.sql` only widens validation for already-migrated databases. No migration drops rows, tables, or columns. The initial schema also includes the human source/action values for fresh installs.
2. **PARTIAL — Regression coverage.** `55 passed, 2 xpassed, 1 xfailed` from `backend/.venv/Scripts/python.exe -m pytest -q`, including location-by-format, override ripple, dashboard/export effective category, human resolution, upload/view/download, unreadable API handling, processing retry, and deterministic timestamp tests. Browser/Vitest interaction tests could not be added because neither browser automation nor Vitest is installed in this environment.
3. **MISSING — Self-evaluation score.** The allowed before and after `score_cli.py` commands both failed because `C:\Users\User\sdoc-eval\server\score_cli.py` is absent. Before: unavailable. After: unavailable. No answer-key or ground-truth data was read.

## Post-fix totals and handoff

Before fixes: **8 PASS, 25 PARTIAL, 5 MISSING**.

After fixes: **29 PASS, 8 PARTIAL, 1 MISSING**.

The remaining partials are the browser-only visual/click-through checks, the
honest location limitation for missing/unreadable fields, and the
wrong-document action's lack of a representative fixture click-through. The
remaining missing item is external evaluator availability, not an application
failure.

The final rules-only pipeline run used a new scratch runtime/output directory,
completed with 520 entries and zero OpenAI calls/failures, and wrote
`.runtime/ux-audit-final2-output-20260921-152035/submission.json`. Its row shape
matches `data/sample_submission.json` exactly: 520 email keys and
`category`, `status`, `review_reason`, `has_defect`, `defect_fields` on every
row. Status counts were unchanged from the pre-fix export (411 OK, 28
MISMATCH, 81 NEEDS_REVIEW); five review reasons were corrected to distinguish
single-attachment cases from unreadable inputs.

No real database or Supabase credentials were used. Mutating checks used only
the fixture dataset and isolated `.runtime/ux-audit-*` stores; the existing
port-8000 process was not modified.
