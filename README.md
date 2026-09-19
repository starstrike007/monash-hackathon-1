# ShipCheck

ShipCheck classifies a shipping inbox, compares Shipping Instructions with draft Bills of Lading, and routes uncertain cases to human review.

## Quick start

Frontend:

```bash
npm install
npm run dev
```

The Vite frontend includes Dashboard, Inbox, mismatch detail, human-review detail, and pipeline-run views. If the API is unavailable, it uses a small local reference dataset so the UI remains navigable.

API and pipeline:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8000
```

The API reads the 520 email fixtures and 250 attachments from `data/`. It uses `.runtime/shipcheck_store.json` for offline results unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.

## Architecture

The browser talks only to FastAPI. The API reads `data/`, runs the four pipeline stages, and writes results through the storage adapter. OpenAI is reserved for classification and extraction fallbacks; comparison and decision logic remain deterministic. The deployed storage adapter uses Supabase Postgres, while local development falls back to JSON.

See [the architecture diagram](docs/architecture.png) and [the team Git workflow](docs/team-git-workflow.md).

## Supabase

Apply `supabase/migrations/001_initial_schema.sql` to the Supabase project before using the deployed storage adapter. The service-role key is backend-only; the browser does not connect to Supabase directly.

The frontend calls FastAPI through `VITE_API_BASE_URL`:

```js
import { getDashboard } from '@/lib/api'
```

## Environment

Copy `.env.example` to `.env` and fill in local values. Never commit `.env` or real credentials. Backend-only variables include `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATA_DIR`, `RUNTIME_DIR`, and `CORS_ORIGINS`.

## Formatting and checks

```bash
npm run format:check
npm run build
python -m compileall -q backend
pytest -q backend/tests
```

## Working agreements

- Read [`AGENTS.md`](AGENTS.md) before making changes.
- Keep feature work inside its owning folder under `src/features/`.
- Keep shared routing, API contracts, UI primitives, and migrations coordinated by one owner.
- Treat `data/` as read-only fixture input.
- Never read, copy, or reference `ground_truth.json`.
