-- Additive UX support for human resolutions and reviewer-provided files.
-- Existing rows, tables, and columns are preserved.

alter table emails
  add column if not exists uploaded_attachments jsonb not null default '[]'::jsonb,
  add column if not exists excluded_attachments jsonb not null default '[]'::jsonb;

alter table audit_log
  add column if not exists evidence jsonb;
