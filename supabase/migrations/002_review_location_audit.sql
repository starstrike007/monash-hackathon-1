-- Additive migration: simulated timestamps + classification provenance +
-- category override on emails, location tracking on field_extractions, a
-- review queue, and an append-only audit log.
--
-- Never drops or renames an existing column or table; only adds.

alter table emails
  add column if not exists classification_method text
    check (classification_method is null or classification_method in ('rules', 'llm')),
  add column if not exists classification_reason text,
  add column if not exists category_machine text
    check (category_machine is null or category_machine in
      ('BL_COMPARISON', 'SI_REQUEST', 'INVOICE_QUERY', 'GENERAL', 'SPAM')),
  add column if not exists category_override text
    check (category_override is null or category_override in
      ('BL_COMPARISON', 'SI_REQUEST', 'INVOICE_QUERY', 'GENERAL', 'SPAM')),
  add column if not exists override_by text,
  add column if not exists override_at timestamptz;

-- `evidence` already carries page/sheet/cell as loose jsonb; `location` is a
-- narrower, purpose-built object (page, line, sheet, cell, table_index,
-- row_index, bbox, quoted_text) so the document viewer can query/scroll to
-- it without parsing the free-text evidence blob.
alter table field_extractions
  add column if not exists location jsonb;

create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  email_id text not null references emails(email_id) on delete cascade,
  reason text not null check (reason in
    ('unreadable', 'missing_attachment', 'missing_value', 'wrong_doc_type', 'processing_failed')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  description text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution jsonb
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  email_id text references emails(email_id) on delete cascade,
  action text not null,
  before jsonb,
  after jsonb,
  actor text,
  evidence_ref text,
  created_at timestamptz not null default now()
);

create index if not exists review_items_email_idx on review_items(email_id);
create index if not exists review_items_status_idx on review_items(status);
create index if not exists audit_log_email_idx on audit_log(email_id);
