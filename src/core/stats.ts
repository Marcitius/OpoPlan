import { active } from "./types";
import type { DataSet, Node, SessionKind } from "./types";
import { dayAt, addDays } from "./dates";
import { replayMemory } from "./memory";
export function isActiveNode(n: Node, nodes: Node[]): boolean {
  if (n.archived || n.deleted_at) return false;
  const seen = new Set<string>([n.id]);
  let id = n.parent_id;
  while (id) {
    const p = nodes.find((n) => n.id === id);
    if (!p || p.archived || p.deleted_at || seen.has(id)) return false;
    seen.add(id);
    id = p.parent_id;
  }
  return true;
}
export const blocks = (d: DataSet, oppositionId: string) =>
  d.nodes.filter(
    (n) =>
      n.opposition_id === oppositionId &&
      n.kind === "block" &&
      isActiveNode(n, d.nodes),
  );
export function descendants(id: string, nodes: Node[]): Node[] {
  const result: Node[] = [];
  const walk = (p: string) => {
    for (const n of nodes.filter((n) => n.parent_id === p)) {
      result.push(n);
      walk(n.id);
    }
  };
  walk(id);
  return result;
}
export function nodePath(n: Node, nodes: Node[]): string {
  const names = [n.name],
    seen = new Set([n.id]);
  let id = n.parent_id;
  while (id) {
    const p = nodes.find((n) => n.id === id);
    if (!p || seen.has(id)) break;
    seen.add(id);
    names.unshift(p.name);
    id = p.parent_id;
  }
  return names.join(" / ");
}
export function getStates(d: DataSet) {
  return new Map(
    d.nodes.map((n) => [
      n.id,
      replayMemory(d.memory_events.filter((e) => e.node_id === n.id)),
    ]),
  );
}
export function coverage(d: DataSet, oppositionId: string) {
  const b = blocks(d, oppositionId),
    states = getStates(d);
  const count = Math.max(3, ...b.map((n) => states.get(n.id)?.passes ?? 0));
  return Array.from({ length: Math.min(count, 20) }, (_, i) => ({
    pass: i + 1,
    count: b.filter((n) => (states.get(n.id)?.passes ?? 0) >= i + 1).length,
    total: b.length,
  }));
}
export function statistics(
  d: DataSet,
  oppositionId: string,
  timezone: string,
  from: string,
  to: string,
  kind: SessionKind | "all" = "all",
  subjectId = "",
) {
  const allowedIds = subjectId
    ? new Set([subjectId, ...descendants(subjectId, d.nodes).map((n) => n.id)])
    : null;
  const sessions = active(d.sessions).filter(
    (s) =>
      s.opposition_id === oppositionId &&
      dayAt(s.started_at, timezone) >= from &&
      dayAt(s.started_at, timezone) <= to &&
      (kind === "all" || s.kind === kind),
  );
  const allocations = active(d.session_blocks);
  const seconds = (s: (typeof sessions)[number]) =>
    allowedIds
      ? allocations
          .filter((a) => a.session_id === s.id && allowedIds.has(a.node_id))
          .reduce((sum, a) => sum + a.allocated_seconds, 0)
      : s.duration_seconds;
  const byDay: Record<string, number> = {},
    byKind = { study: 0, review: 0, practice: 0 };
  for (const s of sessions) {
    const sec = seconds(s);
    byDay[dayAt(s.started_at, timezone)] =
      (byDay[dayAt(s.started_at, timezone)] ?? 0) + sec;
    byKind[s.kind] += sec;
  }
  const total = Object.values(byKind).reduce((a, b) => a + b, 0);
  const dates = Object.keys(byDay)
    .filter((d) => byDay[d] > 0)
    .sort();
  let bestStreak = 0,
    run = 0,
    last = "";
  for (const day of dates) {
    run = last && addDays(last, 1) === day ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    last = day;
  }
  const bySubject: Record<string, number> = {};
  for (const s of sessions) {
    const rows = allocations.filter((a) => a.session_id === s.id);
    if (!rows.length) {
      bySubject["Práctica sin bloque"] =
        (bySubject["Práctica sin bloque"] ?? 0) + seconds(s);
      continue;
    }
    for (const a of rows) {
      if (allowedIds && !allowedIds.has(a.node_id)) continue;
      let n = d.nodes.find((n) => n.id === a.node_id);
      while (n?.parent_id) n = d.nodes.find((x) => x.id === n!.parent_id);
      const name = n?.name ?? "Archivado";
      bySubject[name] = (bySubject[name] ?? 0) + a.allocated_seconds;
    }
  }
  return {
    sessions: sessions.filter((s) => seconds(s) > 0),
    total,
    byDay,
    byKind,
    bySubject,
    activeDays: dates.length,
    bestStreak,
  };
}
export function score(
  correct: number,
  wrong: number,
  total: number,
  penalty: number,
  max: number,
) {
  return total === 0
    ? 0
    : Math.round(((correct - wrong * penalty) / total) * max * 100) / 100;
}
