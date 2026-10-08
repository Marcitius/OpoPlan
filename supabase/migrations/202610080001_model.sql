-- OpoPlan 001 · normalized private model. Apply only to the independent OpoPlan project.
begin;
create table public.profiles (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 display_name text not null default '', preferences jsonb not null,
 check(id=owner_id)
);
create table public.oppositions (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 name text not null check(length(trim(name)) between 1 and 200), exam_date date, archived boolean not null default false
);
create table public.nodes (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 opposition_id uuid not null,parent_id uuid,source_node_id uuid,name text not null check(length(trim(name)) between 1 and 300),kind text not null check(kind in ('container','block')),position integer not null default 0,archived boolean not null default false,importance integer not null default 3 check(importance between 1 and 5),estimated_minutes integer not null default 20 check(estimated_minutes between 1 and 1440),notes text not null default '',
 foreign key(owner_id,opposition_id) references public.oppositions(owner_id,id),
 foreign key(owner_id,parent_id) references public.nodes(owner_id,id) deferrable initially deferred,
 foreign key(owner_id,source_node_id) references public.nodes(owner_id,id) deferrable initially deferred,
 check(parent_id is distinct from id)
);
create table public.categories (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 name text not null check(length(trim(name)) between 1 and 200),color text not null default '#287462' 
);
create table public.plan_tasks (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 opposition_id uuid not null,node_id uuid,category_id uuid,name text not null check(length(trim(name)) between 1 and 300),kind text not null check(kind in ('study','review','practice')),scheduled_day date not null,original_day date not null,estimated_minutes integer not null check(estimated_minutes between 1 and 1440),status text not null check(status in ('pending','completed','cancelled')),notes text not null default '',completed_session_id uuid,
 foreign key(owner_id,opposition_id) references public.oppositions(owner_id,id),foreign key(owner_id,node_id) references public.nodes(owner_id,id),foreign key(owner_id,category_id) references public.categories(owner_id,id)
);
create table public.sessions (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 opposition_id uuid not null,kind text not null check(kind in ('study','review','practice')),started_at timestamptz not null,ended_at timestamptz not null,duration_seconds integer not null check(duration_seconds between 1 and 604800),notes text not null default '',concentration integer check(concentration between 1 and 5),difficulty integer check(difficulty between 1 and 5),source text not null check(source in ('manual','timer')),planned_task_id uuid,
 foreign key(owner_id,opposition_id) references public.oppositions(owner_id,id),foreign key(owner_id,planned_task_id) references public.plan_tasks(owner_id,id) deferrable initially deferred,check(ended_at>=started_at)
);
create table public.session_blocks (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 session_id uuid not null,node_id uuid not null,allocated_seconds integer not null check(allocated_seconds>=0),progress integer not null default 0 check(progress between 0 and 100),completed boolean not null default false,
 foreign key(owner_id,session_id) references public.sessions(owner_id,id) deferrable initially deferred,foreign key(owner_id,node_id) references public.nodes(owner_id,id),unique(owner_id,session_id,node_id),check(not completed or progress=100)
);
create table public.memory_events (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 node_id uuid not null,session_id uuid,kind text not null check(kind in ('study','review','reschedule','reset','exclude','include','correction','void')),occurred_at timestamptz not null,study_day date not null,timezone text not null,rating text check(rating in ('mal','regular','bien')),notes text not null default '',manual_due date,target_event_id uuid,rules jsonb not null,scheduled_due date,
 foreign key(owner_id,node_id) references public.nodes(owner_id,id),foreign key(owner_id,session_id) references public.sessions(owner_id,id) deferrable initially deferred,foreign key(owner_id,target_event_id) references public.memory_events(owner_id,id) deferrable initially deferred,
 check((kind in ('review','correction'))=(rating is not null)),check((kind in ('correction','void'))=(target_event_id is not null)),check((kind='reschedule')=(manual_due is not null)),check(kind not in ('study','review') or session_id is not null)
);
create table public.test_results (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 session_id uuid not null,category_id uuid,name text not null,test_type text not null,question_count integer not null check(question_count>0),correct integer not null check(correct>=0),wrong integer not null check(wrong>=0),blank integer not null check(blank>=0),penalty numeric not null check(penalty>=0),score numeric not null,max_score numeric not null check(max_score>0),score_manual boolean not null default false,notes text not null default '',
 foreign key(owner_id,session_id) references public.sessions(owner_id,id) deferrable initially deferred,foreign key(owner_id,category_id) references public.categories(owner_id,id),unique(owner_id,session_id),check(correct+wrong+blank=question_count)
);
create table public.test_links (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 test_id uuid not null,node_id uuid not null,error_notes text not null default '',foreign key(owner_id,test_id) references public.test_results(owner_id,id) deferrable initially deferred,foreign key(owner_id,node_id) references public.nodes(owner_id,id),unique(owner_id,test_id,node_id)
);
create table public.coverage_snapshots (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 opposition_id uuid not null,day date not null,active_blocks integer not null check(active_blocks>=0),coverage jsonb not null,foreign key(owner_id,opposition_id) references public.oppositions(owner_id,id)
);
create table public.push_subscriptions (
 id uuid not null default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 primary key(owner_id,id),
 endpoint text not null,subscription jsonb not null,last_sent_day date,unique(owner_id,endpoint)
);
alter table public.plan_tasks add constraint completed_session_owner_fk foreign key(owner_id,completed_session_id) references public.sessions(owner_id,id) deferrable initially deferred;
create table public.review_state(owner_id uuid not null references auth.users(id) on delete cascade,node_id uuid not null,state jsonb not null,updated_at timestamptz not null default now(),primary key(owner_id,node_id),foreign key(owner_id,node_id) references public.nodes(owner_id,id));
create table public.sync_operations(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null,payload jsonb not null,result jsonb not null,before_rows jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,id));
create index nodes_tree on public.nodes(owner_id,opposition_id,parent_id,position);
create index sessions_dates on public.sessions(owner_id,opposition_id,started_at);
create index memory_chronology on public.memory_events(owner_id,node_id,occurred_at,id);
create index tasks_dates on public.plan_tasks(owner_id,opposition_id,scheduled_day,status);
create index assignments_sessions on public.session_blocks(owner_id,session_id);
create index test_categories on public.test_results(owner_id,category_id);
alter table public.profiles enable row level security;
create policy owner_read on public.profiles for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.profiles for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.profiles for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.profiles for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
alter table public.oppositions enable row level security;
create policy owner_read on public.oppositions for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.oppositions for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.oppositions for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.oppositions for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.oppositions from anon,authenticated;
grant select on public.oppositions to authenticated;
alter table public.nodes enable row level security;
create policy owner_read on public.nodes for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.nodes for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.nodes for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.nodes for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.nodes from anon,authenticated;
grant select on public.nodes to authenticated;
alter table public.categories enable row level security;
create policy owner_read on public.categories for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.categories for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.categories for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.categories for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.categories from anon,authenticated;
grant select on public.categories to authenticated;
alter table public.plan_tasks enable row level security;
create policy owner_read on public.plan_tasks for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.plan_tasks for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.plan_tasks for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.plan_tasks for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.plan_tasks from anon,authenticated;
grant select on public.plan_tasks to authenticated;
alter table public.sessions enable row level security;
create policy owner_read on public.sessions for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.sessions for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.sessions for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.sessions for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.sessions from anon,authenticated;
grant select on public.sessions to authenticated;
alter table public.session_blocks enable row level security;
create policy owner_read on public.session_blocks for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.session_blocks for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.session_blocks for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.session_blocks for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.session_blocks from anon,authenticated;
grant select on public.session_blocks to authenticated;
alter table public.memory_events enable row level security;
create policy owner_read on public.memory_events for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.memory_events for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.memory_events for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.memory_events for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.memory_events from anon,authenticated;
grant select on public.memory_events to authenticated;
alter table public.test_results enable row level security;
create policy owner_read on public.test_results for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.test_results for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.test_results for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.test_results for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.test_results from anon,authenticated;
grant select on public.test_results to authenticated;
alter table public.test_links enable row level security;
create policy owner_read on public.test_links for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.test_links for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.test_links for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.test_links for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.test_links from anon,authenticated;
grant select on public.test_links to authenticated;
alter table public.coverage_snapshots enable row level security;
create policy owner_read on public.coverage_snapshots for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.coverage_snapshots for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.coverage_snapshots for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.coverage_snapshots for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.coverage_snapshots from anon,authenticated;
grant select on public.coverage_snapshots to authenticated;
alter table public.push_subscriptions enable row level security;
create policy owner_read on public.push_subscriptions for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.push_subscriptions for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.push_subscriptions for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.push_subscriptions for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.push_subscriptions from anon,authenticated;
grant select on public.push_subscriptions to authenticated;
alter table public.review_state enable row level security;
create policy owner_read on public.review_state for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.review_state for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.review_state for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.review_state for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.review_state from anon,authenticated;
grant select on public.review_state to authenticated;
alter table public.sync_operations enable row level security;
create policy owner_read on public.sync_operations for select to authenticated using ((select auth.uid())=owner_id);
create policy owner_insert on public.sync_operations for insert to authenticated with check ((select auth.uid())=owner_id);
create policy owner_update on public.sync_operations for update to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
create policy owner_delete on public.sync_operations for delete to authenticated using ((select auth.uid())=owner_id);
revoke all on public.sync_operations from anon,authenticated;
grant select on public.sync_operations to authenticated;
-- All browser writes use the version-checked RPC; direct table mutation is intentionally revoked.
commit;
