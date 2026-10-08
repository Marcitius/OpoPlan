-- OpoPlan: optional start time for individual or batch planning.
-- Incremental and backward-compatible. Run once in SQL Editor; never re-run INSTALL.sql.
begin;
alter table public.plan_tasks
  add column if not exists scheduled_time time without time zone;
create index if not exists plan_tasks_agenda_idx
  on public.plan_tasks(owner_id, opposition_id, scheduled_day, scheduled_time)
  where deleted_at is null;
commit;
