import { describe, expect, it } from "vitest";
import { buildScopeIndex, immediateSubtopics, scopeBlockIds, scopeIndexOverlaps, scopeRoots } from "../src/core/planScope";
import { node, A } from "./helpers";

describe("planificación de temas completos y subtemas", () => {
  const constitution = node(A, A, null, "container", "Constitución");
  const title1 = node(A, A, constitution.id, "block", "Título I");
  const title2 = node(A, A, constitution.id, "container", "Título II");
  const article = node(A, A, title2.id, "block", "Artículos");
  const defender = node(A, A, null, "container", "Defensor del Pueblo");
  const procedure = node(A, A, defender.id, "block", "Procedimiento");
  const nodes = [constitution, title1, title2, article, defender, procedure];
  const blocks = [title1, article, procedure];
  it("un tema completo equivale a todos sus bloques y no a un evento de memoria del contenedor", () => {
    expect(scopeBlockIds(constitution.id, nodes, blocks)).toEqual([title1.id, article.id]);
  });
  it("un subtema solo afecta a sus descendientes", () => {
    expect(scopeBlockIds(title2.id, nodes, blocks)).toEqual([article.id]);
    expect(immediateSubtopics(constitution.id, nodes, blocks).map(n => n.id)).toEqual([title2.id]);
  });
  it("detecta solapamiento entre tema y bloque, sin bloquear otras materias", () => {
    const index = buildScopeIndex(nodes, blocks);
    expect(scopeIndexOverlaps(constitution.id, title1.id, index)).toBe(true);
    expect(scopeIndexOverlaps(title2.id, article.id, index)).toBe(true);
    expect(scopeIndexOverlaps(constitution.id, procedure.id, index)).toBe(false);
  });
  it("permite cambiar de tema y conservar selecciones independientes", () => {
    const index = buildScopeIndex(nodes, blocks);
    expect(scopeRoots(nodes, blocks).map(n => n.id)).toEqual([constitution.id, defender.id]);
    expect(index.get(constitution.id)).toEqual([title1.id, article.id]);
    expect(index.get(defender.id)).toEqual([procedure.id]);
  });
});
