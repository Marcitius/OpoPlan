import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarPlus, ListTodo, Plus, Pencil, Trash2, Search } from "lucide-react";
import { useApp, change } from "../data/context";
import { Button, Field, Modal, ErrorText } from "../components/ui";
import { PlanContentPicker } from "../components/PlanContentPicker";
import { active, base } from "../core/types";
import type { PlanTask, SessionKind } from "../core/types";
import { dayAt } from "../core/dates";
import { blocks } from "../core/stats";
import { estimateScopeMinutes } from "../core/estimates";
import { scopesOverlap } from "../core/planScope";

const kindName = { study: "Estudio", review: "Repaso", practice: "Práctica" };

function TaskEditor({ task, onDone }: { task?: PlanTask; onDone: () => void }) {
  const { owner, oppositionId, data, save, preferences } = useApp();
  const [name, setName] = useState(task?.name ?? "");
  const [kind, setKind] = useState<SessionKind>(task?.kind ?? "practice");
  const [node, setNode] = useState(task?.node_id ?? "");
  const [minutes, setMinutes] = useState(task?.estimated_minutes ?? 20);
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const today = dayAt(new Date(), preferences.timezone);
      await save("plan_tasks", {
        ...(task ?? base(owner)), opposition_id: oppositionId, name: name.trim(), kind,
        node_id: kind === "practice" ? null : (node || null), category_id: task?.category_id ?? null,
        scheduled_day: task?.scheduled_day ?? today,
        original_day: task?.original_day ?? today,
        scheduled_time: null, is_backlog: true,
        estimated_minutes: minutes, status: "pending" as const, notes,
        completed_session_id: null,
      });
      onDone();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };
  return <form className="stack" onSubmit={e => void onSave(e)}>
    <Field label="Nombre de la tarea"><input required maxLength={300} value={name} onChange={e => setName(e.target.value)} placeholder="Ej.: Inglés · ejercicios 20 y 21" /></Field>
    <div className="form-grid">
      <Field label="Tipo"><select value={kind} onChange={e => { setKind(e.target.value as SessionKind); setNode(""); }}>
        <option value="practice">Práctica</option><option value="review">Repaso</option><option value="study">Estudio nuevo</option>
      </select></Field>
      <Field label="Minutos estimados"><input type="number" min={1} max={1440} required value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></Field>
    </div>
    {kind !== "practice" && <p className="help">Para usar las valoraciones y la repetición espaciada, vincula un bloque o tema. Las tareas sueltas sin temario pueden registrarse como Práctica.</p>}
    {kind !== "practice" && <PlanContentPicker nodes={data.nodes} availableBlocks={blocks(data, oppositionId)} kind={kind} value={node} onChange={id => {
      setNode(id);
      if (id) setMinutes(estimateScopeMinutes(data, oppositionId, id, kind).minutes);
    }} />}
    <Field label="Notas (opcional)"><textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Página, ejercicios o instrucciones..."/></Field>
    <p className="help">Esta tarea no aparecerá en la agenda hasta que elijas un día. Podrás modificar su duración después.</p>
    <ErrorText error={error}/>
    <div className="modal-footer"><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button><Button disabled={busy}>{busy ? "Guardando…" : "Guardar tarea"}</Button></div>
  </form>;
}
export function Tasks() {
  const { data, oppositionId, commit, save, preferences } = useApp();
  const today = dayAt(new Date(), preferences.timezone);
  const items = useMemo(() => active(data.plan_tasks).filter(t => t.opposition_id === oppositionId && t.is_backlog && t.status === "pending").sort((a,b)=>a.created_at.localeCompare(b.created_at)), [data.plan_tasks, oppositionId]);
  const [editing, setEditing] = useState<PlanTask | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const filtered = items.filter(t => (t.name + " " + t.notes).toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es")));
  const chosen = items.filter(t => selected.includes(t.id));
  async function plan() {
    if (!chosen.length) return;
    setBusy(true);setError("");
    try {
      const scheduled = active(data.plan_tasks).filter(t=>t.opposition_id===oppositionId && !t.is_backlog && t.status === "pending" && t.scheduled_day === date);
      const current = [...scheduled];
      const allBlocks = blocks(data, oppositionId);
      for (const t of chosen) {
        if (t.kind === "review" && t.node_id && current.some(other => other.kind === "review" && scopesOverlap(t.node_id,other.node_id,data.nodes,allBlocks)))
          throw new Error(`El repaso «${t.name}» se solapa con otro de ese día.`);
        current.push(t);
      }
      await commit(chosen.map(t => change("plan_tasks", {...t,is_backlog:false,scheduled_day:date,scheduled_time:null})), `Se han añadido ${chosen.length} tareas al día ${date}.`);
      setSelected([]);
    } catch(err) {setError((err as Error).message);} finally {setBusy(false);}
  }
  return <>
    <header className="page-heading"><div><span className="eyebrow">SIN FECHA · SIN PRISA</span><h1>Tareas pendientes</h1><p>Guarda ejercicios, repasos o cosas por hacer. Planifícalas cuando quieras.</p></div><Button onClick={()=>setEditing("new")}><Plus size={18}/> Nueva tarea</Button></header>
    <section className="panel task-inbox">
      <div className="task-inbox-toolbar"><label className="search"><Search size={17}/><input aria-label="Buscar tareas" placeholder="Buscar tareas…" value={query} onChange={e=>setQuery(e.target.value)}/></label><span className="muted">{items.length} pendientes</span></div>
      {items.length ? <>
        <div className="task-inbox-selectbar"><button className="textbtn" onClick={()=>setSelected(old=>filtered.every(t=>old.includes(t.id))?old.filter(id=>!filtered.some(t=>t.id===id)):[...new Set([...old,...filtered.map(t=>t.id)])])}>{filtered.length && filtered.every(t=>selected.includes(t.id)) ? "Desmarcar visibles" : "Seleccionar visibles"}</button><button className="textbtn" onClick={()=>setSelected([])}>Limpiar</button></div>
        <div className="task-inbox-list">{filtered.map(t=><div className="task-inbox-row" key={t.id}><label className="task-inbox-check"><input type="checkbox" checked={selected.includes(t.id)} onChange={e=>setSelected(old=>e.target.checked?[...old.filter(id=>id!==t.id),t.id]:old.filter(id=>id!==t.id))}/><span><strong>{t.name}</strong><small>{kindName[t.kind]} · {t.estimated_minutes} min</small>{t.notes && <small>{t.notes}</small>}</span></label><div className="task-inbox-actions"><button className="iconbtn" aria-label={`Editar ${t.name}`} onClick={()=>setEditing(t)}><Pencil size={18}/></button><button className="iconbtn" aria-label={`Eliminar ${t.name}`} onClick={()=>{if(confirm(`¿Eliminar «${t.name}» de las tareas pendientes?`))void save("plan_tasks",{...t,status:"cancelled"});}}><Trash2 size={18}/></button></div></div>)}</div>
        {!filtered.length && <p className="help">No hay tareas con ese filtro.</p>}
      </> : <div className="empty"><ListTodo size={28}/><h3>Aquí puedes guardar lo que no quieres olvidar</h3><p>Por ejemplo, «Psicotécnicos 23 y 24» o «Repaso del Manual de Cálculo».</p><Button onClick={()=>setEditing("new")}><Plus size={17}/> Crear la primera tarea</Button></div>}
    </section>
    {!!chosen.length && <section className="panel task-inbox-schedule"><div><strong>{chosen.length} {chosen.length===1?"tarea seleccionada":"tareas seleccionadas"}</strong><p className="help">Se moverán a la agenda; conservarán su nombre, tiempo y notas.</p></div><Field label="Añadir al día"><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></Field><Button disabled={busy} onClick={()=>void plan()}><CalendarPlus size={17}/>{busy?"Guardando…":`Planificar ${chosen.length}`}</Button><ErrorText error={error}/></section>}
    <p className="help">También puedes seleccionar tareas pendientes desde Hoy → Planificar día.</p>
    <Modal title={editing === "new" ? "Nueva tarea sin fecha" : "Editar tarea"} open={!!editing} onClose={()=>setEditing(null)}>
      {editing && <TaskEditor key={editing==="new"?"new":editing.id} task={editing==="new"?undefined:editing} onDone={()=>setEditing(null)}/>}
    </Modal>
  </>;
}
