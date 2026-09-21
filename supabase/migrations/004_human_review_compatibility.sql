-- Compatibility migration for databases that already applied 001_initial_schema.
-- This only widens validation to accept reviewer-sourced values/actions; it
-- does not delete rows, tables, or columns.

alter table field_extractions
  drop constraint if exists field_extractions_source_check;

alter table field_extractions
  add constraint field_extractions_source_check
  check (source is null or source in ('rule', 'llm', 'vision', 'human'));

alter table review_decisions
  drop constraint if exists review_decisions_action_check;

alter table review_decisions
  add constraint review_decisions_action_check
  check (action in ('confirm', 'correct', 'confirm_absent'));
