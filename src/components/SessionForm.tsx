import { useState } from "react";
import { Button, Field, ErrorText, BlockPicker } from "./ui";
import { useApp } from "../data/context";
import { active } from "../core/types";
import type { Rating, SessionKind, TestResult, Base } from "../core/types";
import { blocks, score } from "../core/stats";
import { fromLocal, localInput } from "../core/dates";
import { timerElapsed } from "../core/timer";
export interface SessionOptions {
  kind: SessionKind;
  nodeIds?: string[];
  taskId?: string;
  timer?: boolean;
  test?: boolean;
}
export function SessionForm({
  options,
  onDone,
}: {
  options: SessionOptions;
  onDone: () => void;
}) {
  const { data, preferences, oppositionId, record, timer } = useApp(),
    available = blocks(
      data,
      options.timer ? (timer?.oppositionId ?? oppositionId) : oppositionId,
    );
  const capturedTimer = options.timer ? timer : null;
  const [kind, setKind] = useState(options.kind),
    [ids, setIds] = useState(options.nodeIds ?? capturedTimer?.nodeIds ?? []),
    [minutes, setMinutes] = useState(
      capturedTimer
        ? Math.max(1, Math.round(timerElapsed(capturedTimer) / 60))
        : 20,
    ),
    [date, setDate] = useState(
      localInput(
        capturedTimer?.startedAt ?? new Date().toISOString(),
        preferences.timezone,
      ),
    ),
    [notes, setNotes] = useState(""),
    [difficulty, setDifficulty] = useState(""),
    [concentration, setConcentration] = useState(""),
    [perBlock, setPerBlock] = useState<
      Record<
        string,
        {
          done: boolean;
          progress: number;
          rating: Rating;
          notes: string;
          seconds?: number;
        }
      >
    >({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [hasTest, setHasTest] = useState(options.test ?? false),
    [test, setTest] = useState({
      name: "",
      type: "Test",
      category: "",
      total: 30,
      correct: 0,
      wrong: 0,
      blank: 30,
      penalty: 0,
      max: 10,
      manual: false,
      score: 0,
    }),
    [errorBlocks, setErrorBlocks] = useState<string[]>([]),
    [errorNotes, setErrorNotes] = useState("");
  const seconds = capturedTimer
    ? Math.max(1, Math.round(timerElapsed(capturedTimer)))
    : Math.round(minutes * 60);
  const allocations = ids.map(
    (id, i) =>
      perBlock[id]?.seconds ??
      Math.floor(seconds / ids.length) +
        (i === ids.length - 1 ? seconds % ids.length : 0),
  );
  const upd = (id: string, p: Partial<(typeof perBlock)[string]>) =>
    setPerBlock((v) => ({
      ...v,
      [id]: {
        ...(v[id] ?? {
          done: false,
          progress: 50,
          rating: "bien" as Rating,
          notes: "",
        }),
        ...p,
      },
    }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (hasTest && test.total !== test.correct + test.wrong + test.blank)
        throw new Error("Aciertos, errores y blancos deben sumar el total.");
      if (ids.length && allocations.reduce((a, b) => a + b, 0) !== seconds)
        throw new Error(
          "Ajusta el reparto: debe sumar exactamente " + seconds + " segundos.",
        );
      const startedAt =
        capturedTimer?.startedAt ?? fromLocal(date, preferences.timezone);
      const testData: Omit<TestResult, keyof Base | "session_id"> | undefined =
        hasTest
          ? {
              category_id: test.category || null,
              name: test.name || test.type,
              test_type: test.type,
              question_count: test.total,
              correct: test.correct,
              wrong: test.wrong,
              blank: test.blank,
              penalty: test.penalty,
              score: test.manual
                ? test.score
                : score(
                    test.correct,
                    test.wrong,
                    test.total,
                    test.penalty,
                    test.max,
                  ),
              max_score: test.max,
              score_manual: test.manual,
              notes: errorNotes,
            }
          : undefined;
      await record({
        id: capturedTimer?.id,
        oppositionId: capturedTimer?.oppositionId,
        kind,
        nodeIds: ids,
        allocations,
        completed: ids.map(
          (id) => kind === "study" && (perBlock[id]?.done ?? false),
        ),
        progress: ids.map((id) =>
          perBlock[id]?.done ? 100 : (perBlock[id]?.progress ?? 50),
        ),
        ratings: ids.map((id) => perBlock[id]?.rating ?? "bien"),
        blockNotes: ids.map((id) => perBlock[id]?.notes ?? ""),
        duration: seconds,
        startedAt,
        endedAt: capturedTimer
          ? new Date().toISOString()
          : new Date(
              new Date(startedAt).getTime() + seconds * 1000,
            ).toISOString(),
        source: capturedTimer ? "timer" : "manual",
        notes,
        concentration: concentration ? +concentration : null,
        difficulty: difficulty ? +difficulty : null,
        taskId: options.taskId ?? capturedTimer?.taskId,
        test: testData,
        errors: errorBlocks.map((nodeId) => ({ nodeId, notes: errorNotes })),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <div className="form-grid">
        <Field label="Actividad">
          <select
            value={kind}
            disabled={!!capturedTimer}
            onChange={(e) => {
              setKind(e.target.value as SessionKind);
              if (e.target.value !== "practice") setHasTest(false);
            }}
          >
            <option value="study">Estudio nuevo</option>
            <option value="review">Repaso</option>
            <option value="practice">Práctica</option>
          </select>
        </Field>
        <Field label={`Fecha real (${preferences.timezone})`}>
          <input
            type="datetime-local"
            required
            value={date}
            disabled={!!capturedTimer}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Tiempo de estudio (minutos)">
          <input
            type="number"
            min="0.1"
            step="0.1"
            max="10080"
            required
            value={capturedTimer ? (seconds / 60).toFixed(1) : minutes}
            disabled={!!capturedTimer}
            onChange={(e) => setMinutes(+e.target.value)}
          />
        </Field>
      </div>
      <BlockPicker
        nodes={available}
        allNodes={data.nodes}
        selected={ids}
        onChange={setIds}
      />
      {ids.map((id, i) => {
        const b = data.nodes.find((n) => n.id === id)!;
        return (
          <div className="block-assessment" key={id}>
            <strong>{b.name}</strong>
            <div className="form-grid">
              <Field label="Tiempo asignado (segundos)">
                <input
                  type="number"
                  min="0"
                  value={allocations[i]}
                  onChange={(e) => upd(id, { seconds: +e.target.value })}
                />
              </Field>
              {kind === "study" ? (
                <>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={perBlock[id]?.done ?? false}
                      onChange={(e) => upd(id, { done: e.target.checked })}
                    />
                    Estudio inicial completado
                  </label>
                  {!perBlock[id]?.done && (
                    <Field label="Avance parcial (%)">
                      <input
                        type="number"
                        min="0"
                        max="99"
                        value={perBlock[id]?.progress ?? 50}
                        onChange={(e) => upd(id, { progress: +e.target.value })}
                      />
                    </Field>
                  )}
                </>
              ) : kind === "review" ? (
                <Field label="Recuerdo">
                  <select
                    aria-label={"Recuerdo de " + b.name}
                    value={perBlock[id]?.rating ?? "bien"}
                    onChange={(e) =>
                      upd(id, { rating: e.target.value as Rating })
                    }
                  >
                    <option value="mal">Mal · recuerdo insuficiente</option>
                    <option value="regular">Regular · con dificultad</option>
                    <option value="bien">Bien · satisfactorio</option>
                  </select>
                </Field>
              ) : null}
            </div>
            {kind === "review" && (
              <Field label="Partes olvidadas / comentario">
                <input
                  value={perBlock[id]?.notes ?? ""}
                  onChange={(e) => upd(id, { notes: e.target.value })}
                />
              </Field>
            )}
          </div>
        );
      })}
      {kind === "review" && (
        <p className="help">
          Un bloque cuenta como un repaso por día. Otra sesión del mismo día
          añade tiempo real y actualiza la valoración sin multiplicar la vuelta.
        </p>
      )}
      {kind === "practice" && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={hasTest}
              onChange={(e) => setHasTest(e.target.checked)}
            />
            Registrar resultado de test o simulacro
          </label>
          {hasTest && (
            <div className="block-assessment stack">
              <div className="form-grid">
                <Field label="Nombre de la prueba">
                  <input
                    required
                    value={test.name}
                    onChange={(e) => setTest({ ...test, name: e.target.value })}
                  />
                </Field>
                <Field label="Tipo de prueba">
                  <input
                    required
                    value={test.type}
                    onChange={(e) => setTest({ ...test, type: e.target.value })}
                  />
                </Field>
                <Field label="Categoría">
                  <select
                    value={test.category}
                    onChange={(e) =>
                      setTest({ ...test, category: e.target.value })
                    }
                  >
                    <option value="">Sin categoría</option>
                    {active(data.categories).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {(
                  [
                    "total",
                    "correct",
                    "wrong",
                    "blank",
                    "penalty",
                    "max",
                  ] as const
                ).map((k) => (
                  <Field
                    label={
                      {
                        total: "Preguntas",
                        correct: "Aciertos",
                        wrong: "Errores",
                        blank: "Blancos",
                        penalty: "Penalización por error",
                        max: "Nota máxima",
                      }[k]
                    }
                    key={k}
                  >
                    <input
                      type="number"
                      min={k === "total" || k === "max" ? 1 : 0}
                      step={k === "penalty" || k === "max" ? "0.01" : "1"}
                      value={test[k]}
                      onChange={(e) =>
                        setTest({ ...test, [k]: +e.target.value })
                      }
                    />
                  </Field>
                ))}
              </div>
              <p className="help">
                Nota = (aciertos − errores × penalización) / preguntas × nota
                máxima. Puede ser negativa.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={test.manual}
                  onChange={(e) =>
                    setTest({ ...test, manual: e.target.checked })
                  }
                />
                Introducir nota manual
              </label>
              {test.manual ? (
                <Field label="Nota obtenida">
                  <input
                    type="number"
                    step="0.01"
                    value={test.score}
                    onChange={(e) =>
                      setTest({ ...test, score: +e.target.value })
                    }
                  />
                </Field>
              ) : (
                <strong>
                  Nota:{" "}
                  {score(
                    test.correct,
                    test.wrong,
                    test.total,
                    test.penalty,
                    test.max,
                  )}{" "}
                  / {test.max}
                </strong>
              )}
              <Field label="Errores detectados">
                <textarea
                  value={errorNotes}
                  onChange={(e) => setErrorNotes(e.target.value)}
                />
              </Field>
              <p className="muted">Vincular errores con bloques (opcional)</p>
              <BlockPicker
                nodes={available}
                allNodes={data.nodes}
                selected={errorBlocks}
                onChange={setErrorBlocks}
              />
            </div>
          )}
        </>
      )}
      <div className="form-grid">
        <Field label="Concentración (opcional)">
          <select
            value={concentration}
            onChange={(e) => setConcentration(e.target.value)}
          >
            <option value="">Sin valorar</option>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v} / 5
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dificultad (opcional)">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">Sin valorar</option>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {v} / 5
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notas de la sesión">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <div className="modal-footer">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button disabled={busy}>
          {busy ? "Guardando…" : "Guardar sesión"}
        </Button>
      </div>
    </form>
  );
}
