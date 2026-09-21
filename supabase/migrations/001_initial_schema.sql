create table if not exists emails (
  email_id text primary key,
  subject text not null,
  sender text not null,
  received_at timestamptz,
  body_preview text,
  attachment_meta jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists pipeline_runs (
  id uuid primary key,
  status text not null check (status in ('queued', 'running', 'complete', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  total_emails integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '{}'::jsonb
);

create table if not exists pipeline_run_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  stage_number smallint not null check (stage_number between 1 and 4),
  stage_name text not null,
  status text not null check (status in ('queued', 'running', 'complete', 'partial', 'failed')),
  processed_count integer not null default 0,
  total_count integer not null default 0,
  failed_count integer not null default 0,
  review_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  unique (run_id, stage_number)
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  email_id text not null references emails(email_id) on delete cascade,
  category text not null check (category in ('BL_COMPARISON', 'SI_REQUEST', 'INVOICE_QUERY', 'GENERAL', 'SPAM')),
  status text check (status is null or status in ('OK', 'MISMATCH', 'NEEDS_REVIEW')),
  review_reason text check (review_reason is null or review_reason in ('wrong_doc_type', 'missing_attachment', 'unreadable', 'missing_value')),
  has_defect boolean,
  defect_fields text[] not null default '{}',
  skipped_fields text[] not null default '{}',
  si_path text,
  bl_path text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, email_id)
);

create table if not exists field_extractions (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references results(id) on delete cascade,
  document_role text not null check (document_role in ('SI', 'BL')),
  field_name text not null check (field_name in ('shipper', 'consignee', 'notify_party', 'port_of_loading', 'port_of_discharge', 'container_count', 'gross_weight_kg')),
  state text not null check (state in ('found', 'missing', 'placeholder', 'ambiguous', 'unreadable')),
  raw_value text,
  normalized_value text,
  source text check (source is null or source in ('rule', 'llm', 'vision', 'human')),
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  evidence jsonb,
  unique (result_id, document_role, field_name)
);

create table if not exists review_decisions (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references results(id) on delete cascade,
  field_name text not null,
  action text not null check (action in ('confirm', 'correct', 'confirm_absent')),
  original_value text,
  corrected_value text,
  reviewer_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists results_email_idx on results(email_id);
create index if not exists results_status_idx on results(status);
create index if not exists field_extractions_result_idx on field_extractions(result_id);
create index if not exists review_decisions_result_idx on review_decisions(result_id);
