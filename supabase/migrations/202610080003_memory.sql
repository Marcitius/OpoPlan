begin;
-- Same deterministic reducer as src/core/memory.ts. Dates use date arithmetic, never 24-hour milliseconds.
create function public.rebuild_memory(uid uuid,nid uuid) returns void language plpgsql security definer set search_path='' as $$
declare e record; studied boolean=false; reviews int=0; passes int=0; repetitions int=0; ease numeric=2.5; interval_days int=0; due date; automatic_due date; manual boolean=false; enabled boolean=true; rating text; last_day date; reason text='Completa el estudio inicial para programar el primer repaso.'; difficulties int=0; q int; first_days int; second_days int; max_days int; multiplier numeric;
begin
 for e in
  with mods as (select distinct on(target_event_id) * from public.memory_events where owner_id=uid and node_id=nid and deleted_at is null and kind in ('correction','void') order by target_event_id,occurred_at desc,id desc),
  effective as (select ev.*,coalesce(m.rating,ev.rating) effective_rating,coalesce(m.notes,ev.notes) effective_notes from public.memory_events ev left join mods m on m.target_event_id=ev.id where ev.owner_id=uid and ev.node_id=nid and ev.deleted_at is null and ev.kind not in ('correction','void') and coalesce(m.kind,'')<>'void'),
  selected as (select *,row_number() over(partition by study_day,kind order by occurred_at desc,id desc) day_rank from effective)
  select * from selected where kind<>'review' or day_rank=1 order by occurred_at,id
 loop
  first_days=(e.rules->>'firstDays')::int;second_days=(e.rules->>'secondDays')::int;max_days=(e.rules->>'maxDays')::int;multiplier=(e.rules->>'regularMultiplier')::numeric;
  if e.kind='study' and not studied then studied=true;passes=1+reviews;last_day=e.study_day;interval_days=first_days;due=e.study_day+first_days;automatic_due=due;manual=false;reason='Estudio inicial completado · primer repaso en '||first_days||' día(s).';
  elsif e.kind='review' then
   rating=e.effective_rating;q=case rating when 'mal' then 1 when 'regular' then 3 else 5 end;
   ease=greatest(1.3,round(ease+0.1-(5-q)*(0.08+(5-q)*0.02),2));
   if q<3 then repetitions=0;interval_days=first_days;difficulties=difficulties+1;
   else repetitions=repetitions+1;
    if rating='regular' then interval_days=greatest(first_days,round(greatest(1,interval_days)*multiplier)::int);
    elsif repetitions=1 then interval_days=first_days;
    elsif repetitions=2 then interval_days=second_days;
    else interval_days=round(interval_days*ease)::int;end if;
   end if;
   interval_days=least(max_days,greatest(1,interval_days));reviews=reviews+1;passes=case when studied then 1+reviews else 0 end;last_day=e.study_day;due=e.study_day+interval_days;automatic_due=due;manual=false;reason=upper(rating)||' (SM-2: '||q||'/5) · intervalo '||interval_days||' día(s) · facilidad '||ease||'.';
  elsif e.kind='reschedule' then due=e.manual_due;manual=true;reason='Fecha elegida manualmente: '||e.effective_notes||'. Fecha automática: '||coalesce(automatic_due::text,'sin programar')||'.';
  elsif e.kind='reset' then repetitions=0;ease=2.5;interval_days=0;rating=null;last_day=null;manual=false;due=case when studied then e.study_day+first_days else null end;automatic_due=due;reason='Programación reiniciada. Historial y pasadas conservados.';
  elsif e.kind='exclude' then enabled=false;reason='Excluido de repetición espaciada.';
  elsif e.kind='include' then enabled=true;reason='Repetición espaciada activada.';end if;
 end loop;
 insert into public.review_state(owner_id,node_id,state,updated_at) values(uid,nid,jsonb_build_object('studied',studied,'passes',passes,'reviews',reviews,'repetitions',repetitions,'ease',ease,'interval',interval_days,'due',due,'automaticDue',automatic_due,'manual',manual,'enabled',enabled,'rating',rating,'lastDay',last_day,'reason',reason,'difficulties',difficulties),now()) on conflict(owner_id,node_id) do update set state=excluded.state,updated_at=excluded.updated_at;
end $$;
revoke all on function public.rebuild_memory(uuid,uuid) from public,anon,authenticated;
create function public.memory_changed() returns trigger language plpgsql security definer set search_path='' as $$begin perform public.rebuild_memory(new.owner_id,new.node_id);return new;end $$;
create constraint trigger memory_replay after insert on public.memory_events deferrable initially deferred for each row execute function public.memory_changed();
commit;
