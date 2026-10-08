import { useState } from "react";
import { useApp } from "../data/context";
import { Button, Field, ErrorText, Disclosure } from "./ui";
import { base, active } from "../core/types";
import type { PlanTask, SessionKind } from "../core/types";
import { dayAt } from "../core/dates";
import { blocks, nodePath } from "../core/stats";
export function PlanForm({
  task,
  onDone,
  day,
}: {
  task?: PlanTask;
  onDone: () => void;
  day?: string;
}) {
  const { owner, data, oppositionId, preferences, save } = useApp(),
    [name, setName] = useState(task?.name ?? ""),
    [kind, setKind] = useState<SessionKind>(task?.kind ?? "study"),
    [node, setNode] = useState(task?.node_id ?? ""),
    [category, setCategory] = useState(task?.category_id ?? ""),
    [date, setDate] = useState(
      task?.scheduled_day ?? day ?? dayAt(new Date(), preferences.timezone),
    ),
    [minutes, setMinutes] = useState(task?.estimated_minutes ?? 20),
    [notes, setNotes] = useState(task?.notes ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const row: PlanTask = {
            ...(task ?? base(owner)),
            opposition_id: oppositionId,
            name: name.trim(),
            kind,
            node_id: node || null,
            category_id: category || null,
            scheduled_day: date,
            original_day: task?.original_day ?? date,
            estimated_minutes: minutes,
            status: task?.status ?? "pending",
            notes,
            completed_session_id: task?.completed_session_id ?? null,
          };
          await save("plan_tasks", row);
          onDone();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Actividad">
        <input
          required
          maxLength={300}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Qué quieres trabajar"
        />
      </Field>
      <div className="form-grid">
        <Field label="Tipo">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SessionKind)}
          >
            <option value="study">Estudio nuevo</option>
            <option value="review">Repaso</option>
            <option value="practice">Práctica</option>
          </select>
        </Field>
        <Field label="Fecha prevista">
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Minutos previstos">
          <input
            type="number"
            min="1"
            max="1440"
            required
            value={minutes}
            onChange={(e) => setMinutes(+e.target.value)}
          />
        </Field>
      </div>
      <Field label="Bloque relacionado (opcional)">
        <select
          value={node}
          onChange={(e) => {
            setNode(e.target.value);
            if (!name)
              setName(
                data.nodes.find((n) => n.id === e.target.value)?.name ?? "",
              );
          }}
        >
          <option value="">Seleccionar bloque</option>
          {blocks(data, oppositionId).map((n) => (
            <option key={n.id} value={n.id}>
              {nodePath(n, data.nodes)}
            </option>
          ))}
        </select>
      </Field>
      {kind === "practice" && (
        <Field label="Categoría">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Sin categoría</option>
            {active(data.categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Disclosure
        title="Añadir una nota (opcional)"
        open={Boolean(task?.notes)}
      >
        <Field label="Notas">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Disclosure>
      <ErrorText error={error} />
      <div className="modal-footer">
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={busy}>
          {busy ? "Guardando…" : task ? "Guardar cambios" : "Añadir actividad"}
        </Button>
      </div>
    </form>
  );
}
