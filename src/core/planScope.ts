import type { Node } from "./types";

/** Expands a topic/subtopic into its existing, active, revisable blocks. */
export function scopeBlockIds(id: string | null | undefined, allNodes: Node[], activeBlocks: Node[]): string[] {
  if (!id) return [];
  const blockIds = new Set(activeBlocks.map(n => n.id));
  if (blockIds.has(id)) return [id];
  const parentById = new Map(allNodes.map(n => [n.id, n.parent_id]));
  return activeBlocks.filter(n => {
    const seen = new Set<string>();
    let p: string | null = n.parent_id;
    while (p && !seen.has(p)) {
      if (p === id) return true;
      seen.add(p);
      p = parentById.get(p) ?? null;
    }
    return false;
  }).map(n => n.id);
}

/** A topic and one of its children represent overlapping planned reviews. */
export function scopesOverlap(a: string | null | undefined, b: string | null | undefined, nodes: Node[], activeBlocks: Node[]): boolean {
  if (!a || !b) return false;
  const ids = new Set(scopeBlockIds(a, nodes, activeBlocks));
  return scopeBlockIds(b, nodes, activeBlocks).some(id => ids.has(id));
}

/** Only show containers which contain at least one active block. */
export function scopeRoots(nodes: Node[], activeBlocks: Node[]): Node[] {
  const index = new Map(nodes.map(n => [n.id, n]));
  const roots = new Map<string, Node>();
  for (const block of activeBlocks) {
    let root = block;
    const seen = new Set([root.id]);
    while (root.parent_id) {
      const parent = index.get(root.parent_id);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      root = parent;
    }
    if (root.kind === "container") roots.set(root.id, root);
  }
  return [...roots.values()].sort((a,b) => a.position - b.position || a.name.localeCompare(b.name, "es"));
}

export function immediateSubtopics(parentId: string, nodes: Node[], activeBlocks: Node[]): Node[] {
  return nodes.filter(n => n.parent_id === parentId && n.kind === "container" &&
    scopeBlockIds(n.id, nodes, activeBlocks).length > 0 && !n.deleted_at && !n.archived)
    .sort((a,b) => a.position - b.position || a.name.localeCompare(b.name, "es"));
}

/** Fast index for selecting many nodes in a large syllabus. */
export function buildScopeIndex(nodes: Node[], activeBlocks: Node[]): Map<string, string[]> {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const map = new Map<string, string[]>();
  for (const block of activeBlocks) {
    let current: Node | undefined = block;
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      const ids = map.get(current.id) ?? [];
      ids.push(block.id);
      map.set(current.id, ids);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
  }
  return map;
}

export function scopeIndexOverlaps(a: string, b: string, index: Map<string, string[]>): boolean {
  const left = index.get(a) ?? [];
  const right = index.get(b) ?? [];
  if (!left.length || !right.length) return false;
  const smaller = left.length < right.length ? left : right;
  const larger = new Set(left.length < right.length ? right : left);
  return smaller.some(id => larger.has(id));
}
