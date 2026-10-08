begin;
create function public.valid_memory_rules(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
  and p ?& array['version','firstDays','secondDays','maxDays','regularMultiplier']
  and jsonb_typeof(p->'version')='number' and jsonb_typeof(p->'firstDays')='number' and jsonb_typeof(p->'secondDays')='number' and jsonb_typeof(p->'maxDays')='number' and jsonb_typeof(p->'regularMultiplier')='number'
  and (p->>'version')::numeric=1
  and (p->>'firstDays')::numeric between 1 and 30
  and (p->>'firstDays')::numeric=trunc((p->>'firstDays')::numeric)
  and (p->>'secondDays')::numeric between 1 and 60
  and (p->>'secondDays')::numeric=trunc((p->>'secondDays')::numeric)
  and (p->>'maxDays')::numeric between greatest((p->>'firstDays')::numeric,(p->>'secondDays')::numeric) and 3650
  and (p->>'maxDays')::numeric=trunc((p->>'maxDays')::numeric)
  and (p->>'regularMultiplier')::numeric between 1 and 2,false)
$$;
alter table public.memory_events add constraint complete_memory_rules check(public.valid_memory_rules(rules));
create function public.validate_profile() returns trigger language plpgsql set search_path='' as $$
declare p jsonb=new.preferences;field text;limit_value integer;day jsonb;
begin
 if jsonb_typeof(p)<>'object' or not p ?& array['timezone','theme','dailyMinutes','weeklyMinutes','reviewMinutes','studyDays','pomodoroWork','pomodoroBreak','reminders','reminderHour','language','rules'] then raise exception 'Configuración incompleta';end if;
 if jsonb_typeof(p->'timezone')<>'string' or jsonb_typeof(p->'theme')<>'string' or jsonb_typeof(p->'language')<>'string' or not exists(select 1 from pg_timezone_names where name=p->>'timezone') or p->>'theme' not in ('light','dark','auto') or p->>'language'<>'es' or jsonb_typeof(p->'reminders')<>'boolean' or not public.valid_memory_rules(p->'rules') then raise exception 'Configuración no válida';end if;
 foreach field in array array['dailyMinutes','weeklyMinutes','reviewMinutes','pomodoroWork','pomodoroBreak','reminderHour'] loop
  limit_value=case field when 'weeklyMinutes' then 10080 when 'pomodoroWork' then 180 when 'pomodoroBreak' then 60 when 'reminderHour' then 23 else 1440 end;
  if jsonb_typeof(p->field)<>'number' or (p->>field)::numeric<>trunc((p->>field)::numeric) or (p->>field)::numeric not between (case when field in ('pomodoroWork','pomodoroBreak') then 1 else 0 end) and limit_value then raise exception 'Objetivo o intervalo no válido';end if;
 end loop;
 if jsonb_typeof(p->'studyDays')<>'array' then raise exception 'Días de estudio no válidos';end if;
 for day in select * from jsonb_array_elements(p->'studyDays') loop
  if jsonb_typeof(day)<>'number' or day::text::numeric not between 0 and 6 or day::text::numeric<>trunc(day::text::numeric) then raise exception 'Día de estudio no válido';end if;
 end loop;
 return new;
end $$;
create trigger profile_configuration before insert or update on public.profiles for each row execute function public.validate_profile();

create function public.validate_links() returns trigger language plpgsql set search_path='' as $$
declare n public.nodes;s public.sessions;t public.test_results;opid uuid;
begin
 if tg_table_name='test_links' then
  select * into t from public.test_results where owner_id=new.owner_id and id=new.test_id;
  select * into s from public.sessions where owner_id=new.owner_id and id=t.session_id;
  opid=s.opposition_id;
 else
  opid=new.opposition_id;
  if (new.status='completed')<>(new.completed_session_id is not null) then raise exception 'Actividad completada sin sesión real';end if;
  if new.completed_session_id is not null then
   select * into s from public.sessions where owner_id=new.owner_id and id=new.completed_session_id;
   if s.opposition_id<>new.opposition_id or s.kind<>new.kind then raise exception 'Sesión incompatible con actividad prevista';end if;
  end if;
 end if;
 if new.node_id is not null then
  select * into n from public.nodes where owner_id=new.owner_id and id=new.node_id;
  if n.kind<>'block' or n.opposition_id<>opid then raise exception 'Bloque incompatible con actividad';end if;
 end if;
 return new;
end $$;
create constraint trigger test_link_integrity after insert or update on public.test_links deferrable initially deferred for each row execute function public.validate_links();
create constraint trigger plan_link_integrity after insert or update on public.plan_tasks deferrable initially deferred for each row execute function public.validate_links();
revoke all on function public.valid_memory_rules(jsonb),public.validate_profile(),public.validate_links() from public,anon,authenticated;
commit;
