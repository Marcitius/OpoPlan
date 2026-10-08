import type { Node } from "./types";
import type { MemoryState } from "./memory";
/** Index for course navigation. Historical records and identifiers are never mutated. */
export function outlineIndex(nodes: Node[], states: Map<string, MemoryState>) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string | null, Node[]>();
  for (const n of nodes) {
    const key = n.parent_id && byId.has(n.parent_id) ? n.parent_id : null;
    const rows = children.get(key) ?? [];
    rows.push(n);
    children.set(key, rows);
  }
  for (const rows of children.values())
    rows.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const counts = new Map<string, { total: number; studied: number }>(),
    visiting = new Set<string>();
  function count(id: string): { total: number; studied: number } {
    if (counts.has(id)) return counts.get(id)!;
    if (visiting.has(id)) return { total: 0, studied: 0 };
    visiting.add(id);
    const n = byId.get(id);
    let value = {
      total: n?.kind === "block" ? 1 : 0,
      studied: n?.kind === "block" && states.get(id)?.studied ? 1 : 0,
    };
    for (const c of children.get(id) ?? []) {
      const v = count(c.id);
      value = {
        total: value.total + v.total,
        studied: value.studied + v.studied,
      };
    }
    visiting.delete(id);
    counts.set(id, value);
    return value;
  }
  nodes.forEach((n) => count(n.id));
  return { byId, children, counts };
}
