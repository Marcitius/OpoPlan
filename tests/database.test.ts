import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  testDB,
  A,
  B,
  asUser,
  apply,
  ch,
  seed,
  opp,
  node,
  session,
  event,
  allocation,
} from "./helpers";
import { base, DEFAULT_RULES, DEFAULT_PREFS } from "../src/core/types";
import { replayMemory } from "../src/core/memory";
import type { MemoryEvent } from "../src/core/types";
let db: PGlite;
beforeAll(async () => {
  db = await testDB();
}, 60000);
afterAll(async () => await db?.close());
describe("Actual PostgreSQL migration and isolation checks (PGlite)", () => {
  it("every private table has RLS enabled and no anonymous SELECT grant", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'",
    );
    expect(rows.rows.length).toBe(14);
    expect(rows.rows.every((r) => r.relrowsecurity)).toBe(true);
    await expect(
      db.exec("set role anon; select * from public.nodes"),
    ).rejects.toThrow("permission denied");
    await db.exec("reset role");
  });
  it("two database users are isolated, even with manipulated ownership and foreign keys", async () => {
    const { o, n } = await seed(db, A);
    const bo = opp(B);
    await apply(db, B, [ch("oppositions", bo)]);
    expect(
      (await asUser(db, B, "select * from public.nodes where id=$1", [n.id]))
        .rows,
    ).toHaveLength(0);
    await expect(
      apply(db, B, [ch("nodes", { ...node(B, bo.id), parent_id: n.id })]),
    ).rejects.toThrow();
    await expect(
      apply(db, B, [ch("nodes", { ...node(B, bo.id), owner_id: A })]),
    ).rejects.toThrow("Propietario");
    expect(
      (await asUser(db, A, "select * from public.nodes where id=$1", [n.id]))
        .rows,
    ).toHaveLength(1);
  });
  it("server rejects malformed preferences and incomplete rules before any mutation", async () => {
    await expect(
      apply(db, A, [
        ch(
          "profiles",
          {
            ...base(A, A),
            display_name: "",
            preferences: { ...DEFAULT_PREFS, theme: null },
          },
          1,
        ),
      ]),
    ).rejects.toThrow("Configuración");
    const o = opp(),
      n = node(A, o.id),
      s = session(A, o.id);
    await expect(
      apply(db, A, [
        ch("oppositions", o),
        ch("nodes", n),
        ch("sessions", s),
        ch("session_blocks", allocation(A, s.id, n.id)),
        ch("memory_events", {
          ...event(A, n.id, "study", s.ended_at, s.id),
          rules: { version: 1 },
        }),
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query("select * from public.oppositions where id=$1", [o.id]))
        .rows,
    ).toHaveLength(0);
  });
  it("retries are idempotent and reused IDs cannot change payload", async () => {
    const o = opp(),
      id = crypto.randomUUID(),
      changes = [ch("oppositions", o)];
    const first = await apply(db, A, changes, id);
    expect(await apply(db, A, changes, id)).toEqual(first);
    expect(
      (await db.query("select * from public.oppositions where id=$1", [o.id]))
        .rows,
    ).toHaveLength(1);
    await expect(
      apply(db, A, [ch("oppositions", { ...o, name: "other" })], id),
    ).rejects.toThrow("identificador");
  });
  it("CAS conflicts reject entire batches without silent overwrite", async () => {
    const o = opp();
    await apply(db, A, [ch("oppositions", o)]);
    const newNode = node(A, o.id);
    const r = await apply(db, A, [
      ch("oppositions", { ...o, name: "stale" }, 0),
      ch("nodes", newNode),
    ]);
    expect(r.conflicts).toHaveLength(1);
    expect(
      (await db.query("select * from public.nodes where id=$1", [newNode.id]))
        .rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query<{ name: string }>(
          "select name from public.oppositions where id=$1",
          [o.id],
        )
      ).rows[0].name,
    ).toBe(o.name);
  });
  it("rejects leaf parents and cycles", async () => {
    const o = opp(),
      p = node(A, o.id, null, "container"),
      c = node(A, o.id, p.id, "container");
    await apply(db, A, [ch("oppositions", o), ch("nodes", p), ch("nodes", c)]);
    await expect(
      apply(db, A, [ch("nodes", { ...p, parent_id: c.id }, 1)]),
    ).rejects.toThrow("ciclos");
    const leaf = node(A, o.id);
    await apply(db, A, [ch("nodes", leaf)]);
    await expect(
      apply(db, A, [ch("nodes", node(A, o.id, leaf.id))]),
    ).rejects.toThrow("contenedor");
  });
  it("atomic activity validates exact allocations and generates tomorrow from completed study", async () => {
    const o = opp(),
      ns = [node(A, o.id), node(A, o.id), node(A, o.id)],
      s = session(A, o.id);
    await apply(db, A, [
      ch("oppositions", o),
      ...ns.map((n) => ch("nodes", n)),
    ]);
    await expect(
      apply(db, A, [
        ch("sessions", s),
        ch("session_blocks", allocation(A, s.id, ns[0].id, 100)),
      ]),
    ).rejects.toThrow("reparto");
    expect(
      (await db.query("select * from public.sessions where id=$1", [s.id]))
        .rows,
    ).toHaveLength(0);
    await apply(db, A, [
      ch("sessions", s),
      ...ns.map((n) => ch("session_blocks", allocation(A, s.id, n.id, 1000))),
      ch("memory_events", event(A, ns[0].id, "study", s.ended_at, s.id)),
    ]);
    const state = (
      await asUser<{ state: any }>(
        db,
        A,
        "select state from public.review_state where node_id=$1",
        [ns[0].id],
      )
    ).rows[0].state;
    expect(state.due).toBe("2026-10-09");
    expect(
      (
        await asUser<{ duration_seconds: number }>(
          db,
          A,
          "select duration_seconds from public.sessions where id=$1",
          [s.id],
        )
      ).rows[0].duration_seconds,
    ).toBe(3000);
  });
  it("SQL reducer matches TypeScript across grades, same-day duplication and corrections", async () => {
    const o = opp(),
      n = node(A, o.id),
      events: MemoryEvent[] = [];
    await apply(db, A, [ch("oppositions", o), ch("nodes", n)]);
    for (const [date, rating] of [
      ["2026-10-08", "study"],
      ["2026-10-09", "bien"],
      ["2026-10-10", "bien"],
      ["2026-10-16", "regular"],
      ["2026-10-17", "mal"],
    ] as const) {
      const s = session(
        A,
        o.id,
        rating === "study" ? "study" : "review",
        date + "T10:00:00Z",
        1200,
      );
      const ev = event(
        A,
        n.id,
        rating === "study" ? "study" : "review",
        s.ended_at,
        s.id,
        rating === "study" ? null : rating,
      );
      events.push(ev);
      await apply(db, A, [
        ch("sessions", s),
        ch(
          "session_blocks",
          allocation(A, s.id, n.id, 1200, rating === "study"),
        ),
        ch("memory_events", ev),
      ]);
    }
    const extra = session(A, o.id, "review", "2026-10-17T12:00:00Z", 1200),
      duplicate = event(A, n.id, "review", extra.ended_at, extra.id, "regular");
    events.push(duplicate);
    await apply(db, A, [
      ch("sessions", extra),
      ch("session_blocks", allocation(A, extra.id, n.id, 1200, false)),
      ch("memory_events", duplicate),
    ]);
    const correction = {
      ...event(A, n.id, "correction", "2026-10-18T12:00:00Z", null, "bien"),
      target_event_id: events[3].id,
    };
    events.push(correction);
    await apply(db, A, [ch("memory_events", correction)]);
    const sql = (
        await asUser<{ state: any }>(
          db,
          A,
          "select state from public.review_state where node_id=$1",
          [n.id],
        )
      ).rows[0].state,
      ts = replayMemory(events);
    for (const key of [
      "studied",
      "passes",
      "reviews",
      "repetitions",
      "ease",
      "interval",
      "due",
      "automaticDue",
      "manual",
      "enabled",
      "rating",
      "lastDay",
      "difficulties",
    ] as const)
      expect(sql[key], key).toEqual(ts[key]);
    await expect(
      apply(db, A, [
        ch("memory_events", { ...events[0], notes: "overwrite" }, 1),
      ]),
    ).rejects.toThrow("inmutable");
  });
  it("archiving and source-linked new blocks do not destroy historical activity", async () => {
    const o = opp(),
      n = node(A, o.id),
      s = session(A, o.id);
    await apply(db, A, [
      ch("oppositions", o),
      ch("nodes", n),
      ch("sessions", s),
      ch("session_blocks", allocation(A, s.id, n.id)),
      ch("memory_events", event(A, n.id, "study", s.ended_at, s.id)),
    ]);
    const fresh = { ...node(A, o.id), source_node_id: n.id };
    await apply(db, A, [
      ch("nodes", { ...n, archived: true }, 1),
      ch("nodes", fresh),
    ]);
    expect(
      (
        await db.query("select * from public.memory_events where node_id=$1", [
          n.id,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query("select * from public.review_state where node_id=$1", [
          fresh.id,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});
