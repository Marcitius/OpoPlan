import { describe, it, expect } from "vitest";
import { outlineIndex } from "../src/core/outline";
import { getStates, blocks } from "../src/core/stats";
import { emptyData } from "../src/core/types";
import { freshMemory } from "../src/core/memory";
import { node, A } from "./helpers";
describe("progressive syllabus index", () => {
  it("counts only actual blocks below each course level and preserves IDs", () => {
    const root = node(A, A, null, "container", "Materia"),
      topic = node(A, A, root.id, "container", "Tema"),
      a = node(A, A, topic.id),
      b = node(A, A, topic.id);
    const input = [root, topic, a, b],
      copy = structuredClone(input);
    const states = new Map([
      [a.id, { ...freshMemory(), studied: true }],
      [b.id, freshMemory()],
    ]);
    const result = outlineIndex(input, states);
    expect(result.counts.get(root.id)).toEqual({ total: 2, studied: 1 });
    expect(result.children.get(topic.id)?.map((n) => n.id)).toEqual(
      [a, b].sort((a, b) => a.id.localeCompare(b.id)).map((n) => n.id),
    );
    expect(input).toEqual(copy);
  });
  it("handles 5000 blocks without changing coverage or attributing container mastery", () => {
    const d = emptyData(),
      root = node(A, A, null, "container");
    d.nodes = [
      root,
      ...Array.from({ length: 5000 }, (_, i) => ({
        ...node(A, A, root.id),
        position: i,
      })),
    ];
    const states = getStates(d),
      result = outlineIndex(d.nodes, states);
    expect(result.counts.get(root.id)).toEqual({ total: 5000, studied: 0 });
    expect(result.children.get(root.id)).toHaveLength(5000);
    expect(blocks(d, A)).toHaveLength(5000);
    expect(states.get(root.id)?.studied).toBe(false);
  });
});
