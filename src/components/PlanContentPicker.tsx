import { useMemo } from "react";
import { Field } from "./ui";
import type { Node, SessionKind } from "../core/types";
import { immediateSubtopics, scopeBlockIds, scopeRoots } from "../core/planScope";

/** Hierarchical content selector: full topic, full subtopic, or one block. */
export function PlanContentPicker({
  nodes, availableBlocks, value, onChange, kind,
}: {
  nodes: Node[];
  availableBlocks: Node[];
  value: string;
  onChange: (id: string) => void;
  kind: SessionKind;
}) {
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const roots = useMemo(() => scopeRoots(nodes, availableBlocks), [nodes, availableBlocks]);
  const chain = useMemo(() => {
    const result: Node[] = [];
    let current = byId.get(value);
    const seen = new Set<string>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      result.unshift(current);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return result;
  }, [value, byId]);
  const topic = chain[0];
  const selectedContainers = chain.filter(n => n.kind === "container");
  const deepest = selectedContainers.at(-1);
  const sublevels: {parent: Node; options: Node[]; selected: string}[] = [];
  for (let i = 0; i < selectedContainers.length; i++) {
    const parent = selectedContainers[i];
    const options = immediateSubtopics(parent.id, nodes, availableBlocks);
    if (options.length) sublevels.push({
      parent, options, selected: selectedContainers[i+1]?.id ?? "",
    });
  }
  const leafOptions = deepest ? availableBlocks.filter(n => n.parent_id === deepest.id)
    .sort((a,b) => a.position-b.position || a.name.localeCompare(b.name,"es")) : [];
  const count = scopeBlockIds(value, nodes, availableBlocks).length;
  return <div className="stack plan-content-selector">
    <Field label="Tema">
      <select aria-label="Tema del temario" value={topic?.id ?? ""}
        onChange={e => onChange(e.target.value)}>
        <option value="">Seleccionar tema (opcional)</option>
        {roots.map(n => <option value={n.id} key={n.id}>{n.name}</option>)}
      </select>
    </Field>
    {sublevels.map((level,i) => <Field key={level.parent.id} label={i === 0 ? "Subtema / apartado" : `Apartado nivel ${i+2}`}>
      <select value={level.selected} onChange={e => onChange(e.target.value || level.parent.id)}>
        <option value="">Todo «{level.parent.name}»</option>
        {level.options.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
    </Field>)}
    {deepest && leafOptions.length > 0 && <Field label="Bloque (opcional)">
      <select value={chain.at(-1)?.kind === "block" ? value : ""}
        onChange={e => onChange(e.target.value || deepest.id)}>
        <option value="">{kind === "review" ? "Repasar" : "Trabajar"} el {deepest.parent_id ? "apartado" : "tema"} completo ({scopeBlockIds(deepest.id, nodes, availableBlocks).length} bloques)</option>
        {leafOptions.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
      </select>
    </Field>}
    {value && <small className="help">
      {count > 1 ? `${count} bloques incluidos. Al registrar la sesión podrás valorar cada bloque por separado.` :
        count === 1 ? "1 bloque incluido." : "Elige un apartado con bloques activos."}
    </small>}
  </div>;
}
