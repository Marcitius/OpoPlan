import { describe, it, expect } from "vitest";
import {
  replayMemory,
  nextInterval,
  freshMemory,
  effectiveEvents,
} from "../src/core/memory";
import {
  addDays,
  dayAt,
  fromLocal,
  minutesLabel,
  addMonths,
  monthGridStart,
} from "../src/core/dates";
import {
  pauseTimer,
  resumeTimer,
  timerElapsed,
  nextPhase,
} from "../src/core/timer";
import { coverage, statistics, blocks, score } from "../src/core/stats";
import {
  parseTree,
  treeToNodes,
  backup,
  parseBackup,
  restoreChanges,
} from "../src/core/import";
import { emptyData, base } from "../src/core/types";
import { A, B, node, opp, session, event, allocation } from "./helpers";
const n = "33333333-3333-4333-8333-333333333333";
describe("Memory and natural days", () => {
  it("only completed initial study starts first review tomorrow", () => {
    expect(replayMemory([]).due).toBeNull();
    expect(replayMemory([event(A, n)]).due).toBe("2026-10-09");
  });
  it("SM-2 grows with good, regular is conservative and bad resets", () => {
    const study = event(A, n);
    const r1 = event(A, n, "review", "2026-10-09T10:00:00Z", null, "bien");
    const r2 = event(A, n, "review", "2026-10-10T10:00:00Z", null, "bien");
    const r3 = event(A, n, "review", "2026-10-16T10:00:00Z", null, "bien");
    const s = replayMemory([study, r1, r2, r3]);
    expect(s.interval).toBe(17);
    expect(s.passes).toBe(4);
    expect(nextInterval(s, "regular").interval).toBe(20);
    expect(nextInterval(s, "mal").interval).toBe(1);
    expect(nextInterval(s, "mal").repetitions).toBe(0);
  });
  it("two reviews on the same day count once and use the latest grade", () => {
    const a = event(A, n, "review", "2026-10-09T09:00:00Z", null, "bien"),
      b = event(A, n, "review", "2026-10-09T12:00:00Z", null, "mal");
    const s = replayMemory([event(A, n), b, a]);
    expect(s.reviews).toBe(1);
    expect(s.passes).toBe(2);
    expect(s.rating).toBe("mal");
    expect(s.due).toBe("2026-10-10");
  });
  it("correction is an append-only event and does not shift the original day", () => {
    const review = event(A, n, "review", "2026-10-09T09:00:00Z", null, "bien");
    const correction = {
      ...event(A, n, "correction", "2026-10-12T12:00:00Z", null, "mal"),
      target_event_id: review.id,
    };
    const s = replayMemory([event(A, n), review, correction]);
    expect(s.lastDay).toBe("2026-10-09");
    expect(s.rating).toBe("mal");
    expect(review.rating).toBe("bien");
  });
  it("manual dates, resets, excludes and voids retain history", () => {
    const study = event(A, n),
      review = event(A, n, "review", "2026-10-09T09:00:00Z", null, "bien"),
      manual = {
        ...event(A, n, "reschedule", "2026-10-09T12:00:00Z"),
        manual_due: "2026-10-20",
      };
    let s = replayMemory([study, review, manual]);
    expect(s.due).toBe("2026-10-20");
    expect(s.automaticDue).toBe("2026-10-10");
    expect(s.manual).toBe(true);
    s = replayMemory([
      study,
      review,
      event(A, n, "reset", "2026-10-10T09:00:00Z"),
      event(A, n, "exclude", "2026-10-10T10:00:00Z"),
    ]);
    expect(s.passes).toBe(2);
    expect(s.enabled).toBe(false);
    expect(
      effectiveEvents([
        study,
        {
          ...event(A, n, "void", "2026-10-11T09:00:00Z"),
          target_event_id: study.id,
        },
      ]),
    ).toHaveLength(0);
  });
  it("review alone does not invent initial-study coverage", () => {
    const r = event(A, n, "review", "2026-10-09T09:00:00Z", null, "bien");
    expect(replayMemory([r]).passes).toBe(0);
    expect(
      replayMemory([r, event(A, n, "study", "2026-10-10T09:00:00Z")]).passes,
    ).toBe(2);
  });
  it("DST spring and autumn use calendar days and explicit timezones", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(dayAt("2026-10-24T23:30:00Z", "Europe/Madrid")).toBe("2026-10-25");
    expect(fromLocal("2026-03-29T02:30", "Europe/Madrid")).toBe(
      "2026-03-29T01:30:00Z",
    );
    expect(dayAt(fromLocal("2026-10-25T02:30", "Europe/Madrid"))).toBe(
      "2026-10-25",
    );
  });
});
describe("Time and coverage are independent", () => {
  it("a 50-minute session on 3 blocks counts 50 minutes", () => {
    const d = emptyData(),
      o = opp(),
      ns = [node(A, o.id), node(A, o.id), node(A, o.id)],
      s = session(A, o.id);
    d.oppositions = [o];
    d.nodes = ns;
    d.sessions = [s];
    d.session_blocks = ns.map((n) => allocation(A, s.id, n.id, 1000));
    expect(
      statistics(d, o.id, "Europe/Madrid", "2026-10-08", "2026-10-08").total,
    ).toBe(3000);
    d.memory_events = [event(A, ns[0].id)];
    expect(coverage(d, o.id)[0]).toEqual({ pass: 1, count: 1, total: 3 });
    d.nodes.push(node(A, o.id));
    expect(coverage(d, o.id)[0].total).toBe(4);
  });
  it("archive and split preserve old events without mastery inheritance", () => {
    const d = emptyData(),
      o = opp(),
      original = node(A, o.id);
    d.nodes = [original];
    d.oppositions = [o];
    d.memory_events = [event(A, original.id)];
    const newer = { ...node(A, o.id), source_node_id: original.id };
    original.archived = true;
    d.nodes.push(newer);
    expect(blocks(d, o.id)).toHaveLength(1);
    expect(coverage(d, o.id)[0].count).toBe(0);
    expect(d.memory_events).toHaveLength(1);
  });
  it("score formula is configurable, including negative scores", () => {
    expect(score(20, 10, 30, 1 / 3, 10)).toBe(5.56);
    expect(score(0, 30, 30, 1, 10)).toBe(-10);
  });
  it("calendar navigation and time labels handle month ends and minute rounding", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(monthGridStart("2026-10-08")).toBe("2026-09-28");
    expect(minutesLabel(7199)).toBe("2 h 0 min");
    expect(minutesLabel(1)).toBe("<1 min");
  });
  it("timer excludes pauses, resumes after reload and caps Pomodoro work", () => {
    const t = {
      id: n,
      owner_id: A,
      kind: "study" as const,
      nodeIds: [n],
      taskId: null,
      startedAt: "2026-10-08T10:00:00Z",
      runningSince: 0,
      accumulated: 0,
      mode: "continuous" as const,
      phase: "work" as const,
      phaseAccumulated: 0,
      workSeconds: 1500,
      breakSeconds: 300,
    };
    const p = pauseTimer(t, 50000);
    expect(timerElapsed(p, 200000)).toBe(50);
    expect(
      timerElapsed(resumeTimer(JSON.parse(JSON.stringify(p)), 200000), 250000),
    ).toBe(100);
    const pom = { ...t, mode: "pomodoro" as const };
    expect(timerElapsed(pom, 3600000)).toBe(1500);
    const rest = nextPhase(pom, 1500000);
    expect(timerElapsed(rest, 1800000)).toBe(1500);
  });
});
describe("Bulk imports and backups", () => {
  it.each(["json", "csv", "text"] as const)(
    "parses and previews %s hierarchy",
    (format) => {
      const input =
        format === "json"
          ? '[{"name":"Materia","children":[{"name":"Bloque"}]}]'
          : format === "csv"
            ? "id,parent_id,name,kind\n1,,Materia,container\n2,1,Bloque,block"
            : "Materia\n  Bloque";
      const tree = parseTree(input, format);
      expect(tree[0].children[0].kind).toBe("block");
      const result = treeToNodes(tree, A, n, []);
      expect(result.rows).toHaveLength(2);
      expect(treeToNodes(tree, A, n, result.rows).duplicates).toHaveLength(2);
    },
  );
  it("rejects cycles, indent jumps, duplicate siblings and revisable parents", () => {
    expect(() => parseTree("id,parent_id,name\na,b,A\nb,a,B", "csv")).toThrow(
      "Ciclo",
    );
    expect(() => parseTree("M\n    B", "text")).toThrow("salta");
    expect(() => parseTree("M\n  B\n  B", "text")).toThrow("duplicado");
    expect(() =>
      parseTree(
        '[{"name":"A","kind":"block","children":[{"name":"B"}]}]',
        "json",
      ),
    ).toThrow("contenedor");
  });
  it("backups retain relationships and remap consistently to another account", () => {
    const d = emptyData(),
      o = opp(),
      n = node(A, o.id),
      s = session(A, o.id);
    d.oppositions = [o];
    d.nodes = [n];
    d.sessions = [s];
    d.session_blocks = [allocation(A, s.id, n.id)];
    d.memory_events = [event(A, n.id, "study", s.ended_at, s.id)];
    const parsed = parseBackup(JSON.stringify(backup(d, A)));
    expect(restoreChanges(parsed, A, d).changes).toHaveLength(0);
    const restored = restoreChanges(parsed, B, emptyData()).changes;
    const rn = restored.find((c) => c.table === "nodes")!.row;
    const ra = restored.find((c) => c.table === "session_blocks")!.row;
    expect(rn.id).not.toBe(n.id);
    expect(ra.node_id).toBe(rn.id);
    expect(restored.every((c) => c.row.owner_id === B)).toBe(true);
    const restoredData = emptyData();
    for (const c of restored)
      (restoredData[c.table] as any[]).push({ ...c.row, version: 1 });
    expect(restoreChanges(parsed, B, restoredData).changes).toHaveLength(0);
  });
});
