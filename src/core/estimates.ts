import type { DataSet, SessionKind } from "./types";
import { active } from "./types";
import { blocks } from "./stats";
import { scopeBlockIds } from "./planScope";

export interface TimeEstimate {
  minutes: number;
  source: "reviews" | "study" | "default";
  observations: number;
}

const median = (values: number[]) => {
  const xs = [...values].sort((a, b) => a - b);
  const middle = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[middle] : (xs[middle - 1] + xs[middle]) / 2;
};

/** Historical durations are per block, not entire multi-block session time. */
export function estimateBlockMinutes(data: DataSet, blockId: string, kind: SessionKind): TimeEstimate {
  const node = data.nodes.find(n => n.id === blockId);
  const fallback = node?.estimated_minutes ?? 20;
  const sessions = new Map(active(data.sessions).map(s => [s.id, s]));
  const history = active(data.session_blocks)
    .filter(a => a.node_id === blockId && a.allocated_seconds > 0)
    .map(a => ({ session: sessions.get(a.session_id), minutes: a.allocated_seconds / 60 }))
    .filter((r): r is { session: NonNullable<typeof r.session>; minutes: number } => !!r.session)
    .sort((a, b) => b.session.ended_at.localeCompare(a.session.ended_at));
  const sameKind = history.filter(x => x.session.kind === kind).slice(0, 5);
  if (sameKind.length) {
    return { minutes: clamp(median(sameKind.map(x => x.minutes))), source: kind === "review" ? "reviews" : "study", observations: sameKind.length };
  }
  if (kind === "review") {
    // First review: do not reuse an arbitrary 5-min block default after a 40-min study.
    const studied = history.filter(x => x.session.kind === "study").slice(0, 3);
    if (studied.length) return {
      minutes: clamp(median(studied.map(x => x.minutes)) * 0.8),
      source: "study", observations: studied.length,
    };
  }
  return { minutes: clamp(fallback), source: "default", observations: 0 };
}
function clamp(minutes: number) {
  return Math.min(1440, Math.max(1, Math.ceil(minutes)));
}
/** Container estimate is the sum of all its revisable descendant blocks. */
export function estimateScopeMinutes(data: DataSet, oppositionId: string, nodeId: string, kind: SessionKind): TimeEstimate {
  const ids = scopeBlockIds(nodeId, data.nodes, blocks(data, oppositionId));
  if (!ids.length) return { minutes: 20, source: "default", observations: 0 };
  const estimates = ids.map(id => estimateBlockMinutes(data, id, kind));
  return {
    minutes: clamp(estimates.reduce((sum, e) => sum + e.minutes, 0)),
    source: estimates.some(e => e.source === "reviews") ? "reviews" : estimates.some(e => e.source === "study") ? "study" : "default",
    observations: estimates.reduce((sum, e) => sum + e.observations, 0),
  };
}
