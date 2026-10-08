begin;
create function public.apply_operations(operation_id uuid,changes jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid=auth.uid();item jsonb;rowdata jsonb;remote jsonb;current_version integer;tbl text;rid uuid;expected integer;conflicts jsonb='[]';result jsonb;previous jsonb='[]';columns text;updates text;existing jsonb;
begin
 if uid is null then raise exception 'Debes iniciar sesión' using errcode='28000';end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes) not between 1 and 50000 then raise exception 'Lote de cambios no válido';end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select op.payload,op.result into existing,result from public.sync_operations op where op.owner_id=uid and op.id=operation_id;
 if found then if existing<>changes then raise exception 'Un identificador de operación no se puede reutilizar con otro contenido';end if;return result;end if;
 if exists(select 1 from jsonb_array_elements(changes) x group by x->>'table',x->'row'->>'id' having count(*)>1) then raise exception 'Fila duplicada dentro del lote';end if;
 for item in select * from jsonb_array_elements(changes) loop
  tbl=item->>'table';rid=(item->'row'->>'id')::uuid;expected=(item->>'expected_version')::int;
  if tbl not in ('profiles','oppositions','nodes','categories','sessions','session_blocks','memory_events','plan_tasks','test_results','test_links','coverage_snapshots','push_subscriptions') then raise exception 'Tabla no permitida';end if;
  if item->'row'->>'owner_id' is distinct from uid::text or rid is null or expected<0 then raise exception 'Propietario o versión no válidos';end if;
  execute format('select to_jsonb(t) from public.%I t where owner_id=$1 and id=$2',tbl) into remote using uid,rid;
  current_version=coalesce((remote->>'version')::int,0);
  if current_version<>expected then conflicts=conflicts||jsonb_build_array(jsonb_build_object('table',tbl,'id',rid,'expected',expected,'actual',current_version,'remote',remote));end if;
  if tbl='memory_events' and current_version>0 then raise exception 'El historial es inmutable. Añade una corrección o anulación.';end if;
  previous=previous||jsonb_build_array(jsonb_build_object('table',tbl,'id',rid,'row',remote));
 end loop;
 if jsonb_array_length(conflicts)>0 then return jsonb_build_object('conflicts',conflicts);end if;
 for item in select * from jsonb_array_elements(changes) loop
  tbl=item->>'table';rid=(item->'row'->>'id')::uuid;expected=(item->>'expected_version')::int;
  select string_agg(format('%I',attname),',' order by attnum),string_agg(format('%I=excluded.%I',attname,attname),',' order by attnum) filter(where attname not in ('id','owner_id','created_at')) into columns,updates from pg_attribute where attrelid=('public.'||tbl)::regclass and attnum>0 and not attisdropped;
  select x->'row' into remote from jsonb_array_elements(previous) x where x->>'table'=tbl and x->>'id'=rid::text;
  rowdata=(item->'row')||jsonb_build_object('owner_id',uid,'version',expected+1,'updated_at',now(),'created_at',coalesce(remote->'created_at',to_jsonb(now())));
  execute format('insert into public.%1$I(%2$s) select %2$s from jsonb_populate_record(null::public.%1$I,$1) on conflict(owner_id,id) do update set %3$s',tbl,columns,updates) using rowdata;
 end loop;
 -- Immediate constraint evaluation ensures no false cloud-saved response.
 set constraints all immediate;
 result=jsonb_build_object('ok',true,'operation_id',operation_id);
 insert into public.sync_operations(owner_id,id,payload,result,before_rows) values(uid,operation_id,changes,result,previous);
 return result;
end $$;
revoke all on function public.apply_operations(uuid,jsonb) from public,anon;
grant execute on function public.apply_operations(uuid,jsonb) to authenticated;
-- Tombstones are UPDATEs, so Realtime can apply RLS to them.
do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['profiles','oppositions','nodes','categories','sessions','session_blocks','memory_events','plan_tasks','test_results','test_links','coverage_snapshots'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
commit;
