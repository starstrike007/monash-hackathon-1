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

Start the API from the repository root:

```powershell
python -m uvicorn backend.app.main:app --reload --port 8000
```

In a second terminal, install and start the frontend:

```powershell
npm install
npm run dev
```

Run the regression suite from the repository root:

```powershell
pytest -q backend/tests
```

The API reads the bundled email and attachment fixtures. Without Supabase it
uses `.runtime/shipcheck_store.json` for local results. Set the variables in
`backend/.env.example` in the environment before starting the API; the
frontend example is the root `.env.example`.

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
   in the Supabase SQL editor.
3. Copy the project URL and service-role key into the Render environment.

The service-role key is backend-only. The browser never connects to Supabase
directly.

## Render deployment

Create a Render Web Service from this repository using the native Python
runtime. Do not add Docker or Cloud Run configuration.

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `PYTHONPATH=.. uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT`
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
refresh on `/dashboard`, `/inbox`, or `/review/...` is handled by the Vite app.

## Environment files

- [`backend/.env.example`](backend/.env.example) lists backend-only variable
  names with placeholders.
- [`.env.example`](.env.example) lists the Vite variable used by the existing
  root-level frontend.

Never commit `.env` files, service-role keys, OpenAI keys, or other secrets.

## Checks

```powershell
pytest -q backend/tests
python -m compileall -q backend
npm run build
```

Treat `data/` as read-only fixture input. Never read, copy, or reference
`ground_truth.json`.
