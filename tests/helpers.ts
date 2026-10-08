import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { base, DEFAULT_PREFS, DEFAULT_RULES } from "../src/core/types";
import type {
  MemoryEvent,
  MemoryKind,
  Node,
  Rating,
  Session,
  Change,
  SessionBlock,
} from "../src/core/types";
import { dayAt } from "../src/core/dates";
export const A = "11111111-1111-4111-8111-111111111111",
  B = "22222222-2222-4222-8222-222222222222";
export async function testDB() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;insert into auth.users(id,email) values('${A}','a@example.test'),('${B}','b@example.test');`,
  );
  for (const f of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
  return db;
}
export async function asUser<T = Record<string, unknown>>(
  db: PGlite,
  owner: string,
  sql: string,
  params: any[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ]);
    return tx.query<T>(sql, params);
  });
}
export const ch = (
  table: Change["table"],
  row: any,
  expected = row.version,
): Change => ({ table, row, expected_version: expected });
export async function apply(
  db: PGlite,
  owner: string,
  changes: Change[],
  id = crypto.randomUUID(),
) {
  const r = await asUser<{ result: any }>(
    db,
    owner,
    "select public.apply_operations($1,$2::jsonb) result",
    [id, JSON.stringify(changes)],
  );
  return r.rows[0].result;
}
export function opp(owner = A) {
  return {
    ...base(owner),
    name: "Test opposition",
    exam_date: null,
    archived: false,
  };
}
export function node(
  owner: string,
  opposition: string,
  parent: string | null = null,
  kind: "block" | "container" = "block",
  name = "Bloque",
): Node {
  return {
    ...base(owner),
    opposition_id: opposition,
    parent_id: parent,
    source_node_id: null,
    name,
    kind,
    position: 0,
    archived: false,
    importance: 3,
    estimated_minutes: 20,
    notes: "",
  };
}
export function session(
  owner: string,
  opposition: string,
  kind: "study" | "review" | "practice" = "study",
  date = "2026-10-08T10:00:00Z",
  duration = 3000,
): Session {
  return {
    ...base(owner),
    opposition_id: opposition,
    kind,
    started_at: date,
    ended_at: new Date(
      new Date(date).getTime() + duration * 1000,
    ).toISOString(),
    duration_seconds: duration,
    notes: "",
    concentration: null,
    difficulty: null,
    source: "manual",
    planned_task_id: null,
  };
}
export function allocation(
  owner: string,
  sid: string,
  nid: string,
  seconds = 3000,
  completed = true,
): SessionBlock {
  return {
    ...base(owner),
    session_id: sid,
    node_id: nid,
    allocated_seconds: seconds,
    progress: completed ? 100 : 50,
    completed,
  };
}
export function event(
  owner: string,
  nid: string,
  kind: MemoryKind = "study",
  date = "2026-10-08T10:50:00Z",
  sid: string | null = null,
  rating: Rating | null = null,
): MemoryEvent {
  return {
    ...base(owner),
    node_id: nid,
    session_id: sid,
    kind,
    occurred_at: date,
    study_day: dayAt(date, "Europe/Madrid"),
    timezone: "Europe/Madrid",
    rating,
    notes: "",
    manual_due: null,
    target_event_id: null,
    rules: DEFAULT_RULES,
    scheduled_due: null,
  };
}
export async function seed(db: PGlite, owner = A) {
  const o = opp(owner),
    n = node(owner, o.id);
  await apply(db, owner, [
    ch("profiles", {
      ...base(owner, owner),
      display_name: "",
      preferences: DEFAULT_PREFS,
    }),
    ch("oppositions", o),
    ch("nodes", n),
  ]);
  return { o, n };
}
