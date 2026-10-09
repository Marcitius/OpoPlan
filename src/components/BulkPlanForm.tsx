import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, CalendarDays, Search, CheckSquare, ChevronDown, X } from "lucide-react";
import { useApp, change } from "../data/context";
import { Button, Field, ErrorText } from "./ui";
import { active, base } from "../core/types";
import type { PlanTask, SessionKind, Node } from "../core/types";
import { dayAt } from "../core/dates";
import { blocks, nodePath, getStates } from "../core/stats";
import { buildScopeIndex, immediateSubtopics, scopeRoots, scopeIndexOverlaps } from "../core/planScope";
import { PlanContentPicker } from "./PlanContentPicker";
import { planMinutes } from "../core/planner";
import { estimateScopeMinutes } from "../core/estimates";

type Draft = {
  sourceTaskId?: string;
  key: string;
  name: string;
  kind: SessionKind;
  nodeId: string;
  categoryId: string;
  minutes: number;
  time: string;
  notes: string;
};

function after(time: string, minutes: number): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return total < 1440
    ? `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
    : "";
}

function makeDraft(kind: SessionKind, previous?: Draft): Draft {
  return {
    key: crypto.randomUUID(),
    name: "",
    kind,
    nodeId: "",
    categoryId: "",
    minutes: kind === "practice" ? 20 : 30,
    time: previous?.time ? after(previous.time, previous.minutes) : "",
    notes: "",
  };
}

/** Adds an entire day's activities atomically to the offline sync queue. */
export function BulkPlanForm({ day, onDone }: { day: string; onDone: () => void }) {
  const { owner, data, oppositionId, preferences, commit } = useApp();
  const [date, setDate] = useState(day || dayAt(new Date(), preferences.timezone));
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reviewPickerOpen, setReviewPickerOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [scopePath, setScopePath] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewMinutes, setReviewMinutes] = useState(20);
  const [useSuggestedMinutes, setUseSuggestedMinutes] = useState(true);
  const [selectedBacklog, setSelectedBacklog] = useState<string[]>([]);
  const [reviewStart, setReviewStart] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => blocks(data, oppositionId), [data, oppositionId]);
  const availableById = useMemo(() => new Map(available.map(n => [n.id, n])), [available]);
  const scopeIndex = useMemo(() => buildScopeIndex(data.nodes, available), [data.nodes, available]);
  const scopeContents = (id: string) => scopeIndex.get(id) ?? [];
  const overlap = (a: string, b: string) => scopeIndexOverlaps(a, b, scopeIndex);
  const roots = useMemo(() => scopeRoots(data.nodes, available), [data.nodes, available]);
  const targetById = useMemo(() => new Map(data.nodes.filter(n =>
    availableById.has(n.id) || (n.kind === "container" && !n.deleted_at && !n.archived &&
      scopeIndex.has(n.id))
  ).map(n => [n.id, n])), [data.nodes, available, availableById]);
  const scopeId = scopePath.at(-1) || topic;
  const nestedSelectors = useMemo(() => {
    const out: { parent: Node; options: Node[]; selected: string }[] = [];
    let parent = targetById.get(topic);
    for (let i = 0; parent && i < 15; i++) {
      const options = immediateSubtopics(parent.id, data.nodes, available);
      if (!options.length) break;
      out.push({ parent, options, selected: scopePath[i] || "" });
      parent = scopePath[i] ? targetById.get(scopePath[i]) : undefined;
    }
    return out;
  }, [topic, scopePath, targetById, data.nodes, available]);
  const backlog = useMemo(() => active(data.plan_tasks).filter(t => t.opposition_id === oppositionId && t.is_backlog && t.status === "pending"), [data.plan_tasks, oppositionId]);
  const categories = useMemo(() => active(data.categories), [data.categories]);
  const states = useMemo(() => getStates(data), [data]);
  const dayTasks = active(data.plan_tasks).filter(
    t => t.opposition_id === oppositionId && !t.is_backlog && t.scheduled_day === date && t.status !== "cancelled"
  );
  const currentMinutes = planMinutes(dayTasks);
  const nextMinutes = drafts.reduce((sum, draft) => sum + (Number.isFinite(draft.minutes) ? draft.minutes : 0), 0);

  const plannedReviewIds = dayTasks.filter(t => t.kind === "review" && t.node_id).map(t => t.node_id!);
  const draftedReviewIds = drafts.filter(d => d.kind === "review" && d.nodeId).map(d => d.nodeId);
  const otherReviews = [...plannedReviewIds, ...draftedReviewIds];
  const occupied = (id: string) => otherReviews.some(other => overlap(id, other));
  const filteredBlocks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    const within = new Set(scopeContents(scopeId));
    return available
      .filter(n => !!scopeId && within.has(n.id))
      .map(n => ({ node: n, path: nodePath(n, data.nodes) }))
      .filter(x => !needle || x.path.toLocaleLowerCase("es").includes(needle))
      .sort((a, b) => a.path.localeCompare(b.path, "es"));
  }, [available, data.nodes, query, scopeId]);
  const shownBlocks = filteredBlocks.slice(0, 100);
  const chosen = selectedIds.filter(id => targetById.has(id) && !occupied(id));
  const selectableVisible = shownBlocks.filter(x => !occupied(x.node.id) &&
    !chosen.some(id => id !== x.node.id && overlap(id, x.node.id)));
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(x => chosen.includes(x.node.id));
  const scopeNode = targetById.get(scopeId);
  const scopeCount = scopeId ? scopeContents(scopeId).length : 0;
  const topicAlreadyChosen = Boolean(scopeId && chosen.includes(scopeId));
  const scopeConflicts = Boolean(scopeId && occupied(scopeId));
  const changeDraft = (key: string, update: Partial<Draft>) => {
    setDrafts(old => old.map(d => d.key === key ? { ...d, ...update } : d));
  };
  const add = (kind: SessionKind) => setDrafts(old => [...old, makeDraft(kind, old.at(-1))]);
  function addFromBacklog() {
    const added = backlog.filter(t => selectedBacklog.includes(t.id) && !drafts.some(d => d.sourceTaskId === t.id));
    setDrafts(old => [...old, ...added.map(t => ({
      key: crypto.randomUUID(), sourceTaskId: t.id, name: t.name, kind: t.kind,
      nodeId: t.node_id ?? "", categoryId: t.category_id ?? "",
      minutes: t.estimated_minutes, time: "", notes: t.notes,
    }))]);
    setSelectedBacklog([]);
  }

  function toggleBlock(id: string) {
    if (occupied(id)) return;
    setSelectedIds(old => {
      if (old.includes(id)) return old.filter(x => x !== id);
      // Prevent double-scheduling the same content under a topic and a block.
      return [...old.filter(other => !overlap(other, id)), id];
    });
  }

  function addSelectedReviews() {
    if (!chosen.length) return;
    if (!useSuggestedMinutes && (!Number.isInteger(reviewMinutes) || reviewMinutes < 1 || reviewMinutes > 1440)) {
      setError("Indica una duración por bloque entre 1 y 1.440 minutos.");
      return;
    }
    // Respeta el orden en el que se marcaron los bloques, incluso entre temas.
    const picked = chosen.map(id => targetById.get(id)).filter((n): n is Node => !!n);
    let time = reviewStart;
    const additions: Draft[] = picked.map(n => {
      const minutes = useSuggestedMinutes ? estimateScopeMinutes(data, oppositionId, n.id, "review").minutes : reviewMinutes;
      const draft: Draft = {
        key: crypto.randomUUID(),
        name: n.kind === "container" ? `Repaso completo: ${n.name}` : n.name,
        kind: "review",
        nodeId: n.id,
        categoryId: "",
        minutes,
        time,
        notes: "",
      };
      time = after(time, minutes);
      return draft;
    });
    setDrafts(old => {
      return [...old, ...additions];
    });
    setSelectedIds([]);
    setReviewPickerOpen(false);
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    try {
      const tasks: PlanTask[] = drafts.map(d => {
        const original = d.sourceTaskId ? backlog.find(t => t.id === d.sourceTaskId) : undefined;
        if (d.sourceTaskId && !original) throw new Error("Una tarea seleccionada ya no está pendiente. Vuelve a abrir el planificador.");
        const related = targetById.get(d.nodeId);
        const category = categories.find(c => c.id === d.categoryId);
        const name = d.name.trim() || related?.name || category?.name || "";
        if (!name) throw new Error("Indica el nombre de cada actividad o selecciona un bloque.");
        if (!Number.isInteger(d.minutes) || d.minutes < 1 || d.minutes > 1440)
          throw new Error("Los minutos deben estar entre 1 y 1.440.");
        return {
          ...(original ?? base(owner)), opposition_id: oppositionId, name, kind: d.kind,
          node_id: related?.id ?? null,
          category_id: d.kind === "practice" ? category?.id ?? null : null,
          scheduled_day: date, is_backlog: false, scheduled_time: d.time || null,
          original_day: original?.original_day ?? date, estimated_minutes: d.minutes,
          status: "pending", notes: d.notes.trim(), completed_session_id: null,
        };
      });
      if (!tasks.length) throw new Error("Añade al menos una actividad.");
      const usedIds = [...plannedReviewIds];
      for (const task of tasks) {
        const targetId = task.node_id;
        if (task.kind !== "review" || !targetId) continue;
        if (usedIds.some(id => overlap(id, targetId)))
          throw new Error(`«${task.name}» se solapa con otro repaso planificado para ese día.`);
        usedIds.push(targetId);
      }
      setBusy(true);
      await commit(
        tasks.map(t => change("plan_tasks", t)),
        `${tasks.length} actividades guardadas en este dispositivo. Sincronización pendiente.`,
      );
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack bulk-plan-form" onSubmit={submit}>
    <Field label="Día que quieres organizar">
      <input type="date" required value={date} onChange={e => { setDate(e.target.value); setSelectedIds([]); }} />
    </Field>
    <p className="help">Primero elige la fecha. Después marca varios bloques para repasar y ajusta el tiempo y las notas de cada uno. Puedes mezclar repasos, estudio nuevo y prácticas en el mismo día.</p>

    {backlog.length > 0 && <details className="bulk-backlog-picker">
      <summary>Tareas sin fecha ({backlog.length}) · añadir desde pendientes</summary>
      <p className="help">Selecciona tareas que guardaste anteriormente; no se duplicarán. Podrás cambiar sus minutos y notas más abajo.</p>
      <div className="bulk-backlog-list">{backlog.filter(t => !drafts.some(d=>d.sourceTaskId===t.id)).map(t => <label key={t.id} className="bulk-backlog-choice">
        <input type="checkbox" checked={selectedBacklog.includes(t.id)} onChange={e=>setSelectedBacklog(old=>e.target.checked?[...old,t.id]:old.filter(id=>id!==t.id))}/>
        <span><strong>{t.name}</strong><small>{t.kind === "review" ? "Repaso" : t.kind === "study" ? "Estudio" : "Práctica"} · {t.estimated_minutes} min</small></span>
      </label>)}</div>
      <Button type="button" variant="secondary" disabled={!selectedBacklog.length} onClick={addFromBacklog}><Plus size={16}/> Añadir {selectedBacklog.length} tareas al día</Button>
    </details>}

    <section className="bulk-review-picker">
      <button
        type="button"
        className="bulk-review-picker-toggle"
        aria-expanded={reviewPickerOpen}
        onClick={() => setReviewPickerOpen(v => !v)}
      >
        <span className="bulk-review-picker-icon"><CheckSquare size={20} /></span>
        <span><strong>Seleccionar varios bloques para repasar</strong><small>Marca con ✓ los bloques que quieras repasar el día elegido.</small></span>
        <ChevronDown className={reviewPickerOpen ? "expanded" : ""} size={20} />
      </button>
      {reviewPickerOpen && <div className="bulk-review-picker-body">
        <Field label="1. Elige tema o materia">
          <select value={topic} onChange={e => { setTopic(e.target.value); setScopePath([]); setQuery(""); }} aria-label="Filtrar bloques por tema">
            <option value="">Seleccionar tema…</option>
            {roots.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        {nestedSelectors.map((level, i) => <Field key={level.parent.id} label={i === 0 ? "2. Subtema o apartado (opcional)" : `Nivel ${i + 2} (opcional)`}>
          <select value={level.selected} onChange={e => { setScopePath(old => [...old.slice(0, i), ...(e.target.value ? [e.target.value] : [])]); setQuery(""); }}>
            <option value="">Todo «{level.parent.name}»</option>
            {level.options.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </Field>)}
        {scopeNode && <div className="bulk-topic-full-review">
          <div><strong>Repasar {scopeNode.name} completo</strong><small>Una actividad · {scopeCount} {scopeCount === 1 ? "bloque" : "bloques"} incluidos. Al realizarla podrás valorar cada bloque.</small></div>
          <Button type="button" variant="secondary" disabled={scopeConflicts} onClick={() => toggleBlock(scopeId)}>
            {topicAlreadyChosen ? "Quitar selección" : "Seleccionar completo"}
          </Button>
          {scopeConflicts && <small>Ya existe un repaso solapado en el plan de esta fecha.</small>}
        </div>}
        <p className="help">Marca bloques concretos o selecciona el tema completo. Puedes cambiar de tema: la selección anterior permanece.</p>
        {topic && <label className="bulk-review-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Buscar bloques para repasar"
            placeholder="Buscar materia, tema o bloque…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>}
        <div className="bulk-review-picker-list-header">
          <strong>{topic ? `${filteredBlocks.length} bloques en esta sección` : "Elige un tema para ver sus bloques"}</strong>
          <div className="bulk-review-picker-list-actions">
            <button type="button" className="textbtn" disabled={!selectableVisible.length} onClick={() => {
              const ids = selectableVisible.map(x => x.node.id);
              setSelectedIds(old => allVisibleSelected
                ? old.filter(id => !ids.includes(id))
                : [...old.filter(id => !ids.some(target => overlap(id, target))), ...ids]);
            }}>{allVisibleSelected ? "Desmarcar visibles" : "Seleccionar visibles"}</button>
            <button type="button" className="textbtn" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Limpiar</button>
          </div>
        </div>
        {topic && <div className="bulk-review-checkbox-list" role="group" aria-label="Bloques del tema seleccionado">
          {!shownBlocks.length && <p className="help bulk-review-empty">No hay bloques que coincidan con la búsqueda en este tema.</p>}
          {shownBlocks.map(({ node, path }) => {
            const unavailable = occupied(node.id) || chosen.some(id => id !== node.id && overlap(id, node.id));
            const parts = path.split(" / ");
            const scheduled = states.get(node.id);
            return <label className={`bulk-review-choice ${unavailable ? "unavailable" : ""}`} key={node.id}>
              <input
                type="checkbox"
                checked={chosen.includes(node.id)}
                disabled={unavailable}
                onChange={() => toggleBlock(node.id)}
              />
              <span className="bulk-review-choice-text">
                <strong>{node.name}</strong>
                <small>{parts.slice(0, -1).join(" / ") || "Sin carpeta"}</small>
                {unavailable
                  ? <small>{occupied(node.id) ? "Ya incluido en el plan de este día" : "Incluido en el tema completo seleccionado"}</small>
                  : !scheduled?.studied
                    ? <small>Estudio inicial aún no completado</small>
                    : scheduled.due
                      ? <small>Repaso automático: {scheduled.due}</small>
                      : null}
              </span>
            </label>;
          })}
        </div>}
        {topic && filteredBlocks.length > shownBlocks.length && <p className="help">Se muestran los primeros 100 resultados. Utiliza la búsqueda para encontrar otros bloques.</p>}
        <section className="bulk-review-selection" aria-label="Selección acumulada de bloques">
          <div className="bulk-review-selection-heading">
            <strong>Tu selección, aunque cambies de tema</strong>
            <span className="badge">{chosen.length} {chosen.length === 1 ? "selección" : "selecciones"}</span>
          </div>
          {chosen.length ? <div className="bulk-review-selection-list">
            {chosen.map(id => {
              const node = targetById.get(id)!;
              const path = nodePath(node, data.nodes).split(" / ").slice(0, -1).join(" / ");
              return <div className="bulk-review-selected-row" key={id}>
                <span><strong>{node.kind === "container" ? `Tema completo: ${node.name}` : node.name}</strong><small>{node.kind === "container" ? `${scopeContents(id).length} bloques incluidos · ` : ""}{path || "Sin tema"}</small></span>
                <button type="button" className="iconbtn" onClick={() => toggleBlock(id)} aria-label={`Quitar ${node.name} de la selección`}><X size={17} /></button>
              </div>;
            })}
          </div> : <p className="help">Todavía no has seleccionado bloques. Puedes elegirlos de varios temas antes de añadirlos al día.</p>}
        </section>
        <label className="check"><input type="checkbox" checked={useSuggestedMinutes} onChange={e=>setUseSuggestedMinutes(e.target.checked)}/> Usar los tiempos reales de estudio y repaso para estimar cada bloque</label>
        <div className="bulk-review-settings form-grid">
          {!useSuggestedMinutes && <Field label="Minutos por actividad">
            <input type="number" min="1" max="1440" value={reviewMinutes} onChange={e => setReviewMinutes(Number(e.target.value))} />
          </Field>}
          <Field label="Primera hora (opcional)">
            <input type="time" value={reviewStart} onChange={e => setReviewStart(e.target.value)} />
          </Field>
        </div>
        <Button type="button" disabled={!chosen.length} onClick={addSelectedReviews}>
          <Plus size={17} /> Añadir {chosen.length} {chosen.length === 1 ? "repaso" : "repasos"} al día
        </Button>
        <p className="help">Un tema completo se guarda como una actividad, y al realizarlo podrás valorar cada bloque incluido. Planificar no cuenta como repasar.</p>
      </div>}
    </section>

    <div className="bulk-plan-prepared-heading">
      <strong>Actividades preparadas para el día</strong>
      <span className="badge">{drafts.length}</span>
    </div>
    {drafts.length === 0 && <p className="help">Todavía no has añadido actividades. Selecciona bloques arriba o añade estudio, repaso o práctica con los botones siguientes.</p>}
    {drafts.map((d, i) => <section className="bulk-plan-entry" key={d.key} aria-label={`Actividad ${i + 1}`}>
      <div className="bulk-plan-entry-head">
        <strong>Actividad {i + 1}</strong>
        {drafts.length > 1 && <Button type="button" variant="ghost" onClick={() => setDrafts(old => old.filter(x => x.key !== d.key))} aria-label={`Eliminar actividad ${i + 1}`}><Trash2 size={16}/> Quitar</Button>}
      </div>
      <div className="form-grid">
        <Field label="Tipo">
          <select value={d.kind} onChange={e => changeDraft(d.key, {kind: e.target.value as SessionKind, nodeId: "", categoryId: "", name: ""})}>
            <option value="study">Estudio nuevo</option><option value="review">Repaso</option><option value="practice">Práctica</option>
          </select>
        </Field>
        {d.kind === "practice" ? <Field label="Categoría (opcional)">
          <select value={d.categoryId} onChange={e => {
            const name = categories.find(x => x.id === e.target.value)?.name || "";
            changeDraft(d.key, {categoryId:e.target.value, name});
          }}><option value="">Sin categoría</option>{categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select>
        </Field> : <div className="stack bulk-content-picker">
          <PlanContentPicker
            nodes={data.nodes} availableBlocks={available} value={d.nodeId}
            onChange={id => {
              const target = targetById.get(id);
              changeDraft(d.key, { nodeId: id, name: target ? (target.kind === "container" ? `Repaso completo: ${target.name}` : target.name) : "", ...(target ? { minutes: estimateScopeMinutes(data, oppositionId, id, d.kind).minutes } : {}) });
            }}
            kind={d.kind}
          />
        </div>}
        <Field label="Actividad">
          <input maxLength={300} required value={d.name} onChange={e => changeDraft(d.key, {name:e.target.value})} placeholder={d.kind === "practice" ? "Ej.: Test de inglés" : "Nombre de la actividad"}/>
        </Field>
        <Field label="Inicio (opcional)">
          <input type="time" value={d.time} onChange={e => changeDraft(d.key, {time:e.target.value})}/>
        </Field>
        <Field label="Duración prevista (min)">
          <input type="number" min="1" max="1440" required value={d.minutes} onChange={e => changeDraft(d.key, {minutes:Number(e.target.value)})}/>
        </Field>
      </div>
      <Field label="Notas de esta actividad (opcional)">
        <textarea rows={2} maxLength={4000} value={d.notes} onChange={e => changeDraft(d.key, {notes:e.target.value})} placeholder="Qué repasar, qué te cuesta o cualquier indicación para ese día"/>
      </Field>
    </section>)}
    <div className="bulk-plan-actions">
      <Button type="button" variant="secondary" onClick={() => add("study")}><Plus size={16}/> Estudio</Button>
      <Button type="button" variant="secondary" onClick={() => add("review")}><Plus size={16}/> Repaso</Button>
      <Button type="button" variant="secondary" onClick={() => add("practice")}><Plus size={16}/> Práctica</Button>
    </div>
    <div className="bulk-plan-summary"><CalendarDays size={18}/><span>{dayTasks.length} ya previstas ({currentMinutes} min). Añadirás {drafts.length} actividades ({nextMinutes} min).</span></div>
    <ErrorText error={error}/>
    <div className="modal-footer">
      <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={busy || !drafts.length}>{busy ? "Guardando…" : `Guardar ${drafts.length} ${drafts.length === 1 ? "actividad" : "actividades"}`}</Button>
    </div>
  </form>;
}
