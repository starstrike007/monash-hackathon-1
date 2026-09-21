# ShipCheck

ShipCheck classifies a shipping inbox, compares Shipping Instructions with
draft Bills of Lading, and routes uncertain cases to human review.

## Local run

The Vite frontend lives at the repository root in this checkout. The backend
is the `backend/` Python package and reads the bundled `data/` fixtures.

Create a virtual environment and install the backend dependencies:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

Start the API from the `backend/` directory:

```powershell
Set-Location backend
python -m uvicorn app.main:app --reload --port 8000
```

In a second terminal, install and start the frontend:

```powershell
npm install
npm run dev
```

Run the regression suite from the `backend/` directory:

```powershell
Set-Location backend
pytest -q
```

Smoke-test the Stage 1 LLM on only the first five emails:

```powershell
Set-Location backend
python smoke_classify.py --limit 5
```

Run the full Stage 1 export from `backend/`:

```powershell
Set-Location backend
python export_stage1.py
```

The export loads the optional `backend/.env` file automatically. Variables
already present in the process environment take precedence over that file.

The API reads the bundled email and attachment fixtures. Without Supabase it
uses `.runtime/shipcheck_store.json` for local results. Set the variables in
`backend/.env.example` in the environment before starting the API; the
frontend example is the root `.env.example`.

CORS always allows `http://localhost:*`/`http://127.0.0.1:*` in addition to
whatever `ALLOWED_ORIGINS`/`CORS_ORIGINS` is set to, so a deployed
`ALLOWED_ORIGINS` (e.g. the Vercel URL) never blocks a local Vite dev
server. If API calls silently fall back to mock data during local dev,
check the backend is actually running and reachable first — `api.js`
swallows any fetch failure and falls back rather than surfacing an error.

## Screens

- **Dashboard** (`/dashboard`) — key figures, category/outcome breakdowns,
  needs-attention list, defects by field, Run pipeline, Export submission
  JSON, and the pipeline run drawer. Counts always reflect the *effective*
  category (a manual override if one is set, otherwise the pipeline's own
  decision) and open review-queue resolutions.
- **Inbox** (`/inbox`, `/inbox/:emailId`) — what arrived and how it was
  classified, grouped by Today/Yesterday/This week/This month/Earlier. No
  comparison status here by design; a detail page shows the message,
  attachments (with an inline viewer and download), the classification
  method/reason, and a category override dropdown ("Originally classified
  as X" + Revert once overridden).
- **Docs Comparison** (`/docs-comparison`, `/docs-comparison/:emailId`) —
  every `BL_COMPARISON` email's comparison result: a filterable list, and a
  detail page with a state-aware banner, the seven-field SI/BL table, two
  document viewers scrolled and highlighted to the selected field's
  evidence, and a collapsed "how this was decided" section.
- **Review queue** (`/review`, `/review/:itemId`) — everything a person
  must resolve (its own id, not an email id), oldest first, filterable by
  reason, with reason-specific actions: confirm/correct a value
  (unreadable, missing_value), reassign SI/BL roles (wrong_doc_type),
  reclassify or copy a draft reply (missing_attachment — uploading a
  replacement file from the reviewer's device is not implemented), or
  retry (processing_failed). The sidebar badge shows the open count.

## Simulated timestamps

The dataset has no real receipt times, so each email's `received_at` is
generated once, deterministically, from a hash of its `email_id` (business
hours in Asia/Kuala_Lumpur, spread over the last ~45 days and weighted
toward recent days). It's stored in `email_meta` and never regenerated on
page load. To re-anchor the demo so "Today"/"Yesterday" line up with the
day you're presenting, call:

```powershell
curl -X POST http://localhost:8000/api/admin/rebase-timestamps
```

This regenerates every email's timestamp relative to now and leaves
everything else (results, categories, review state) untouched.

## Category override and the review queue

A category is either the pipeline's own decision (`category_machine`) or a
reviewer's `category_override`; the *effective* category (override if set)
is what every downstream reader uses — dashboard counts, Docs Comparison's
list, and the submission export. Overriding an email into
`BL_COMPARISON` reprocesses it immediately (creating a `missing_attachment`
review item if it has fewer than two usable attachments); overriding it
away closes any open review item for it with resolution `reclassified`.
Every override and review resolution is written to an append-only
`audit_log`. Internal review reasons are slightly richer than the four the
evaluator accepts; `processing_failed` maps to `unreadable` at export time
only (see `backend/app/services/review_queue_service.py`).

## Architecture

The browser talks only to the FastAPI API. FastAPI reads the email corpus and
attachments through the dataset loader, then runs four stages: classify,
extract and normalize, compare, and decide. OpenAI is used only for the
classification and extraction fallbacks. Comparison and decision logic are
deterministic and rule-based. Results, field evidence, review decisions, and
pipeline runs go through the storage adapter; local development uses JSON and
the deployed service uses Supabase Postgres. The submission adapter reads the
stored results and emits the evaluator's submission shape.

This matches [`docs/architecture.png`](docs/architecture.png). The diagram's
Cloud Run label is superseded by the deployment decision for this project:
the backend and pipeline are hosted on Render's native Python runtime, the
frontend is hosted on Vercel, and Supabase is the deployed results store.

## Supabase setup

1. Create a Supabase project.
2. Run [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   and [`supabase/migrations/002_review_location_audit.sql`](supabase/migrations/002_review_location_audit.sql)
   in the Supabase SQL editor, in that order. Migration 002 adds
   classification/override columns on `emails`, a `location` column on
   `field_extractions`, and the `review_items`/`audit_log` tables — nothing
   is dropped or renamed. Without it, the app still works (local JSON
   remains authoritative), but Supabase silently rejects the new columns.
3. Copy the project URL and service-role key into the Render environment.

The service-role key is backend-only. The browser never connects to Supabase
directly.

## Render deployment

Create a Render Web Service from this repository using the native Python
runtime. Do not add Docker or Cloud Run configuration.

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`
- Python version: `3.12` (set `PYTHON_VERSION=3.12.0` if the service does not
  inherit the repository's configured runtime)

Set these environment variables on Render:

```text
OPENAI_API_KEY
OPENAI_MODEL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
DATA_DIR=../data
ALLOWED_ORIGINS=https://your-vercel-domain.example
```

`ALLOWED_ORIGINS` is a comma-separated list when more than one frontend origin
is needed. The service listens on Render's `PORT` value and serves the bundled
`../data` directory from the repository.

Render's free tier spins the service down when idle. Open the app a few
minutes before a demo so the API has time to wake up.

## Vercel deployment

The existing Vite app is at the repository root rather than in a `frontend/`
subdirectory, so set the Vercel Root Directory to `.` and keep the default
Node build environment:

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_URL=https://your-render-api.example`

[`vercel.json`](vercel.json) rewrites client-side routes to `index.html` so a
refresh on `/dashboard`, `/inbox`, `/docs-comparison`, or `/review/...` is
handled by the Vite app.

## Environment files

- [`backend/.env.example`](backend/.env.example) lists backend-only variable
  names with placeholders.
- [`.env.example`](.env.example) lists the Vite variable used by the existing
  root-level frontend.

Never commit `.env` files, service-role keys, OpenAI keys, or other secrets.

## Checks

```powershell
Set-Location backend
pytest -q
python -m compileall -q app
Set-Location ..
npm run build
```

Treat `data/` as read-only fixture input. Never read, copy, or reference
`ground_truth.json`.
