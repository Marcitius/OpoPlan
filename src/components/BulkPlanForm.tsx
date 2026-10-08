import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, CalendarDays, Search, CheckSquare, ChevronDown } from "lucide-react";
import { useApp, change } from "../data/context";
import { Button, Field, ErrorText } from "./ui";
import { active, base } from "../core/types";
import type { PlanTask, SessionKind } from "../core/types";
import { dayAt } from "../core/dates";
import { blocks, nodePath, getStates } from "../core/stats";
import { planMinutes } from "../core/planner";

type Draft = {
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewMinutes, setReviewMinutes] = useState(20);
  const [reviewStart, setReviewStart] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => blocks(data, oppositionId), [data, oppositionId]);
  const categories = useMemo(() => active(data.categories), [data.categories]);
  const states = useMemo(() => getStates(data), [data]);
  const dayTasks = active(data.plan_tasks).filter(
    t => t.opposition_id === oppositionId && t.scheduled_day === date && t.status !== "cancelled"
  );
  const currentMinutes = planMinutes(dayTasks);
  const nextMinutes = drafts.reduce((sum, draft) => sum + (Number.isFinite(draft.minutes) ? draft.minutes : 0), 0);

  const plannedReviewIds = new Set(
    dayTasks.filter(t => t.kind === "review" && t.node_id).map(t => t.node_id)
  );
  const draftedReviewIds = new Set(
    drafts.filter(d => d.kind === "review" && d.nodeId).map(d => d.nodeId)
  );
  const filteredBlocks = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("es");
    return available
      .map(n => ({ node: n, path: nodePath(n, data.nodes) }))
      .filter(x => !needle || x.path.toLocaleLowerCase("es").includes(needle))
      .sort((a, b) => a.path.localeCompare(b.path, "es"));
  }, [available, data.nodes, query]);
  const shownBlocks = filteredBlocks.slice(0, 100);
  const selectableVisible = shownBlocks.filter(
    x => !plannedReviewIds.has(x.node.id) && !draftedReviewIds.has(x.node.id)
  );
  const chosen = selectedIds.filter(
    id => available.some(n => n.id === id) && !plannedReviewIds.has(id) && !draftedReviewIds.has(id)
  );
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every(x => chosen.includes(x.node.id));
  const changeDraft = (key: string, update: Partial<Draft>) => {
    setDrafts(old => old.map(d => d.key === key ? { ...d, ...update } : d));
  };
  const add = (kind: SessionKind) => setDrafts(old => [...old, makeDraft(kind, old.at(-1))]);

  function toggleBlock(id: string) {
    setSelectedIds(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  }

  function addSelectedReviews() {
    if (!chosen.length) return;
    if (!Number.isInteger(reviewMinutes) || reviewMinutes < 1 || reviewMinutes > 1440) {
      setError("Indica una duración por bloque entre 1 y 1.440 minutos.");
      return;
    }
    const picked = available.filter(n => chosen.includes(n.id));
    let time = reviewStart;
    const additions: Draft[] = picked.map(n => {
      const draft: Draft = {
        key: crypto.randomUUID(),
        name: n.name,
        kind: "review",
        nodeId: n.id,
        categoryId: "",
        minutes: reviewMinutes,
        time,
        notes: "",
      };
      time = after(time, reviewMinutes);
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
        const related = available.find(n => n.id === d.nodeId);
        const category = categories.find(c => c.id === d.categoryId);
        const name = d.name.trim() || related?.name || category?.name || "";
        if (!name) throw new Error("Indica el nombre de cada actividad o selecciona un bloque.");
        if (!Number.isInteger(d.minutes) || d.minutes < 1 || d.minutes > 1440)
          throw new Error("Los minutos deben estar entre 1 y 1.440.");
        return {
          ...base(owner), opposition_id: oppositionId, name, kind: d.kind,
          node_id: related?.id ?? null,
          category_id: d.kind === "practice" ? category?.id ?? null : null,
          scheduled_day: date, scheduled_time: d.time || null,
          original_day: date, estimated_minutes: d.minutes,
          status: "pending", notes: d.notes.trim(), completed_session_id: null,
        };
      });
      if (!tasks.length) throw new Error("Añade al menos una actividad.");
      const usedIds = new Set(plannedReviewIds);
      for (const task of tasks) {
        if (task.kind !== "review" || !task.node_id) continue;
        if (usedIds.has(task.node_id))
          throw new Error(`«${task.name}» ya tiene un repaso planificado para esta fecha.`);
        usedIds.add(task.node_id);
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
        <label className="bulk-review-search">
          <Search size={18} />
          <input
            type="search"
            aria-label="Buscar bloques para repasar"
            placeholder="Buscar materia, tema o bloque…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <div className="bulk-review-picker-list-header">
          <strong>{chosen.length} seleccionados</strong>
          <div className="bulk-review-picker-list-actions">
            <button type="button" className="textbtn" disabled={!selectableVisible.length} onClick={() => {
              const ids = selectableVisible.map(x => x.node.id);
              setSelectedIds(old => allVisibleSelected ? old.filter(id => !ids.includes(id)) : [...new Set([...old, ...ids])]);
            }}>{allVisibleSelected ? "Desmarcar visibles" : "Seleccionar visibles"}</button>
            <button type="button" className="textbtn" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>Limpiar</button>
          </div>
        </div>
        <div className="bulk-review-checkbox-list" role="group" aria-label="Bloques del temario">
          {!shownBlocks.length && <p className="help bulk-review-empty">No hay bloques que coincidan con la búsqueda. Añade bloques revisables en Temario si aún no tienes ninguno.</p>}
          {shownBlocks.map(({ node, path }) => {
            const unavailable = plannedReviewIds.has(node.id) || draftedReviewIds.has(node.id);
            const parts = path.split(" / ");
            const scheduled = states.get(node.id);
            return <label className={`bulk-review-choice ${unavailable ? "unavailable" : ""}`} key={node.id}>
              <input
                type="checkbox"
                checked={unavailable || chosen.includes(node.id)}
                disabled={unavailable}
                onChange={() => toggleBlock(node.id)}
              />
              <span className="bulk-review-choice-text">
                <strong>{node.name}</strong>
                <small>{parts.slice(0, -1).join(" / ") || "Sin carpeta"}</small>
                {unavailable
                  ? <small>Ya incluido en el plan de este día</small>
                  : !scheduled?.studied
                    ? <small>Estudio inicial aún no completado</small>
                    : scheduled.due
                      ? <small>Repaso automático: {scheduled.due}</small>
                      : null}
              </span>
            </label>;
          })}
        </div>
        {filteredBlocks.length > shownBlocks.length && <p className="help">Se muestran los primeros 100 resultados. Utiliza la búsqueda para encontrar otros bloques.</p>}
        <div className="bulk-review-settings form-grid">
          <Field label="Minutos por bloque">
            <input type="number" min="1" max="1440" value={reviewMinutes} onChange={e => setReviewMinutes(Number(e.target.value))} />
          </Field>
          <Field label="Primera hora (opcional)">
            <input type="time" value={reviewStart} onChange={e => setReviewStart(e.target.value)} />
          </Field>
        </div>
        <Button type="button" disabled={!chosen.length} onClick={addSelectedReviews}>
          <Plus size={17} /> Añadir {chosen.length} {chosen.length === 1 ? "repaso" : "repasos"} al día
        </Button>
        <p className="help">Podrás revisar las actividades antes de guardarlas. La planificación no cuenta como repaso realizado y no modifica las fechas del algoritmo.</p>
      </div>}
    </section>

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
        </Field> : <Field label="Bloque del temario (opcional)">
          <select value={d.nodeId} onChange={e => {
            const name = available.find(x => x.id === e.target.value)?.name || "";
            changeDraft(d.key, {nodeId:e.target.value, name});
          }}><option value="">Seleccionar bloque</option>{available.map(n => <option key={n.id} value={n.id}>{nodePath(n, data.nodes)}</option>)}</select>
        </Field>}
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
