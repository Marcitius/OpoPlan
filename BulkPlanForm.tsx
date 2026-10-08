import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2, CalendarDays } from "lucide-react";
import { useApp, change } from "../data/context";
import { Button, Field, ErrorText } from "./ui";
import { active, base } from "../core/types";
import type { PlanTask, SessionKind } from "../core/types";
import { dayAt } from "../core/dates";
import { blocks, nodePath } from "../core/stats";
import { planMinutes } from "../core/planner";

type Draft = {
  key: string;
  name: string;
  kind: SessionKind;
  nodeId: string;
  categoryId: string;
  minutes: number;
  time: string;
};
function makeDraft(kind: SessionKind, previous?: Draft): Draft {
  let time = "";
  if (previous?.time) {
    const [h, m] = previous.time.split(":").map(Number);
    const total = h * 60 + m + previous.minutes;
    if (total < 1440) time = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }
  return { key: crypto.randomUUID(), name: "", kind, nodeId: "", categoryId: "", minutes: kind === "practice" ? 20 : 30, time };
}

/** Adds an entire day's activities atomically to the offline sync queue. */
export function BulkPlanForm({ day, onDone }: { day: string; onDone: () => void }) {
  const { owner, data, oppositionId, preferences, commit } = useApp();
  const [date, setDate] = useState(day || dayAt(new Date(), preferences.timezone));
  const [drafts, setDrafts] = useState<Draft[]>([makeDraft("study")]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const available = useMemo(() => blocks(data, oppositionId), [data, oppositionId]);
  const categories = useMemo(() => active(data.categories), [data.categories]);
  const dayTasks = active(data.plan_tasks).filter(t => t.opposition_id === oppositionId && t.scheduled_day === date && t.status !== "cancelled");
  const currentMinutes = planMinutes(dayTasks);
  const nextMinutes = drafts.reduce((sum, draft) => sum + (Number.isFinite(draft.minutes) ? draft.minutes : 0), 0);
  const changeDraft = (key: string, update: Partial<Draft>) => {
    setDrafts(old => old.map(d => d.key === key ? { ...d, ...update } : d));
  };
  const add = (kind: SessionKind) => setDrafts(old => [...old, makeDraft(kind, old.at(-1))]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    try {
      const tasks: PlanTask[] = drafts.map(d => {
        const related = available.find(n => n.id === d.nodeId);
        const category = categories.find(c => c.id === d.categoryId);
        // A block is recommended but not required: the user may plan ahead of importing the syllabus.
        const name = d.name.trim() || related?.name || category?.name || "";
        if (!name) throw new Error("Indica el nombre de cada actividad o selecciona un bloque.");
        if (!Number.isInteger(d.minutes) || d.minutes < 1 || d.minutes > 1440) throw new Error("Los minutos deben estar entre 1 y 1.440.");
        return {
          ...base(owner), opposition_id: oppositionId, name, kind: d.kind,
          node_id: related?.id ?? null,
          category_id: d.kind === "practice" ? category?.id ?? null : null,
          scheduled_day: date, scheduled_time: d.time || null,
          original_day: date, estimated_minutes: d.minutes,
          status: "pending", notes: "", completed_session_id: null,
        };
      });
      if (!tasks.length) throw new Error("Añade al menos una actividad.");
      setBusy(true);
      await commit(tasks.map(t => change("plan_tasks", t)), `${tasks.length} actividades guardadas en este dispositivo. Sincronización pendiente.`);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="stack bulk-plan-form" onSubmit={submit}>
    <Field label="Día que quieres organizar">
      <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
    </Field>
    <p className="help">Prepara varias actividades de una sola vez. Las horas son opcionales; si las indicas, la agenda las ordenará automáticamente.</p>
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
      <Button type="submit" disabled={busy}>{busy ? "Guardando…" : `Guardar ${drafts.length} ${drafts.length === 1 ? "actividad" : "actividades"}`}</Button>
    </div>
  </form>;
}
