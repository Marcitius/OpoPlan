begin;
create function public.validate_node() returns trigger language plpgsql set search_path='' as $$
declare p public.nodes; cycle_found boolean;
begin
 if new.parent_id is not null then
  select * into p from public.nodes where owner_id=new.owner_id and id=new.parent_id;
  if p.id is not null and (p.kind<>'container' or p.opposition_id<>new.opposition_id) then raise exception 'El padre debe ser un contenedor de la misma oposición'; end if;
  with recursive ancestors as (
   select id,parent_id,array[id] path from public.nodes where owner_id=new.owner_id and id=new.parent_id
   union all select n.id,n.parent_id,a.path||n.id from public.nodes n join ancestors a on n.id=a.parent_id and n.owner_id=new.owner_id where not n.id=any(a.path)
  ) select exists(select 1 from ancestors where id=new.id) into cycle_found;
  if cycle_found then raise exception 'No se permiten ciclos en el temario';end if;
 end if;
 if new.kind='block' and exists(select 1 from public.nodes where owner_id=new.owner_id and parent_id=new.id) then raise exception 'Un bloque revisable no puede contener hijos';end if;
 if tg_op='UPDATE' and new.opposition_id<>old.opposition_id then raise exception 'No se puede cambiar un nodo de oposición';end if;
 return new;
end $$;
create constraint trigger node_integrity after insert or update on public.nodes deferrable initially deferred for each row execute function public.validate_node();

create function public.validate_activity() returns trigger language plpgsql set search_path='' as $$
declare sid uuid; uid uuid; s public.sessions; sum_seconds bigint; count_blocks bigint; target public.memory_events;
begin
 uid=new.owner_id;
 if tg_table_name='sessions' then sid=new.id;else sid=new.session_id;end if;
 if tg_table_name='memory_events' then
  if (new.occurred_at at time zone new.timezone)::date<>new.study_day then raise exception 'El día no coincide con la zona horaria';end if;
  if (new.rules->>'version')::int<>1 or (new.rules->>'firstDays')::int not between 1 and 30 or (new.rules->>'secondDays')::int not between 1 and 60 or (new.rules->>'maxDays')::int not between 1 and 3650 or (new.rules->>'regularMultiplier')::numeric not between 1 and 2 then raise exception 'Reglas de repaso no válidas';end if;
  if new.target_event_id is not null then
   select * into target from public.memory_events where owner_id=uid and id=new.target_event_id;
   if target.node_id is distinct from new.node_id or target.kind not in ('study','review','reschedule','reset','include','exclude') or (new.kind='correction' and target.kind<>'review') then raise exception 'Corrección de evento no válida';end if;
  end if;
  if new.kind in ('study','review') and not exists(select 1 from public.session_blocks where owner_id=uid and session_id=sid and node_id=new.node_id and deleted_at is null and (new.kind='review' or completed)) then raise exception 'El evento debe pertenecer a un bloque registrado en la sesión';end if;
 end if;
 if sid is null then return new;end if;
 select * into s from public.sessions where owner_id=uid and id=sid;
 if s.id is null or s.deleted_at is not null then return new;end if;
 select coalesce(sum(allocated_seconds),0),count(*) into sum_seconds,count_blocks from public.session_blocks where owner_id=uid and session_id=sid and deleted_at is null;
 if (s.kind in ('study','review') and count_blocks=0) or (count_blocks>0 and sum_seconds<>s.duration_seconds) then raise exception 'El reparto de tiempo debe sumar exactamente la duración de la sesión';end if;
 if exists(select 1 from public.session_blocks a join public.nodes n on n.owner_id=a.owner_id and n.id=a.node_id where a.owner_id=uid and a.session_id=sid and a.deleted_at is null and (n.opposition_id<>s.opposition_id or n.kind<>'block')) then raise exception 'Bloque de sesión no válido';end if;
 if tg_table_name='memory_events' then
  if new.kind in ('study','review') and s.kind<>(case when new.kind='study' then 'study' else 'review' end) then raise exception 'Tipo de evento incompatible con sesión';end if;
 end if;
 if tg_table_name='test_results' and s.kind<>'practice' then raise exception 'Un test debe pertenecer a una sesión de práctica';end if;
 return new;
end $$;
create constraint trigger validate_sessions after insert or update on public.sessions deferrable initially deferred for each row execute function public.validate_activity();
create constraint trigger validate_session_blocks after insert or update on public.session_blocks deferrable initially deferred for each row execute function public.validate_activity();
create constraint trigger validate_memory_events after insert on public.memory_events deferrable initially deferred for each row execute function public.validate_activity();
create constraint trigger validate_tests after insert or update on public.test_results deferrable initially deferred for each row execute function public.validate_activity();
commit;
