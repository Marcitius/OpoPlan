import { useEffect, useState } from "react";
import { Play, Pause, Square, RotateCcw, BookOpen } from "lucide-react";
import { useApp } from "../data/context";
import { Button, Field, BlockPicker, ErrorText, Empty } from "../components/ui";
import type { SessionOptions } from "../components/SessionForm";
import type { SessionKind } from "../core/types";
import { blocks } from "../core/stats";
import {
  timerElapsed,
  pauseTimer,
  resumeTimer,
  nextPhase,
  phaseRemaining,
} from "../core/timer";
export function Study({ start }: { start: (o: SessionOptions) => void }) {
  const { owner, data, oppositionId, preferences, timer, setTimer, notify } =
    useApp();
  const [kind, setKind] = useState<SessionKind>("study"),
    [ids, setIds] = useState<string[]>([]),
    [mode, setMode] = useState<"continuous" | "pomodoro">("continuous"),
    [tick, setTick] = useState(Date.now()),
    [error, setError] = useState("");
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsed = timer ? Math.floor(timerElapsed(timer, tick)) : 0;
  const fmt = (seconds: number) =>
    `${Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0")}:${Math.floor((seconds / 60) % 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(seconds % 60)
      .toString()
      .padStart(2, "0")}`;
  const done = timer?.mode === "pomodoro" && phaseRemaining(timer, tick) === 0;
  async function begin() {
    setError("");
    if (kind !== "practice" && !ids.length) {
      setError("Selecciona el bloque que vas a estudiar.");
      return;
    }
    await setTimer({
      id: crypto.randomUUID(),
      owner_id: owner,
      oppositionId,
      kind,
      nodeIds: ids,
      taskId: null,
      startedAt: new Date().toISOString(),
      runningSince: Date.now(),
      accumulated: 0,
      mode,
      phase: "work",
      phaseAccumulated: 0,
      workSeconds: preferences.pomodoroWork * 60,
      breakSeconds: preferences.pomodoroBreak * 60,
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">UNA COSA CADA VEZ</div>
          <h1>Tiempo para avanzar.</h1>
          <p>
            Concentración en el bloque. El registro corre por nuestra cuenta.
          </p>
        </div>
        <Button variant="secondary" onClick={() => start({ kind: "study" })}>
          Registrar tiempo manual
        </Button>
      </div>
      <div className="study-grid">
        <section className="panel timer-panel">
          <div className="eyebrow">
            {timer?.phase === "break"
              ? "DESCANSO · NO SUMA TIEMPO"
              : "TU SESIÓN"}
          </div>
          <div className="clock" aria-live="off">
            {fmt(elapsed)}
          </div>
          {timer?.mode === "pomodoro" && (
            <p className="phase-label">
              {timer.phase === "work" ? "Trabajo" : "Descanso"} ·{" "}
              {Math.ceil(phaseRemaining(timer, tick) / 60)} min restantes
            </p>
          )}
          <p className="muted">
            {timer
              ? `${{ study: "Estudio", review: "Repaso", practice: "Práctica" }[timer.kind]} · ${timer.nodeIds.length} bloque(s)`
              : "Selecciona una actividad y empieza."}
          </p>
          {timer ? (
            <>
              <div className="timer-controls">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void setTimer(
                      timer.runningSince === null
                        ? resumeTimer(timer)
                        : pauseTimer(timer),
                    )
                  }
                >
                  {timer.runningSince === null ? (
                    <Play size={18} />
                  ) : (
                    <Pause size={18} />
                  )}{" "}
                  {timer.runningSince === null ? "Reanudar" : "Pausar"}
                </Button>
                <Button
                  onClick={async () => {
                    const paused = pauseTimer(timer);
                    await setTimer(paused);
                    start({
                      kind: timer.kind,
                      nodeIds: timer.nodeIds,
                      timer: true,
                    });
                  }}
                >
                  <Square size={16} />
                  Finalizar
                </Button>
              </div>
              {timer.mode === "pomodoro" && (
                <Button
                  variant="ghost"
                  onClick={() => void setTimer(nextPhase(timer))}
                >
                  {timer.phase === "work"
                    ? "Iniciar descanso"
                    : "Comenzar otro intervalo"}
                </Button>
              )}
              {done && (
                <p className="success" role="status">
                  Intervalo terminado. El tiempo de trabajo se ha detenido;
                  continúa cuando estés listo.
                </p>
              )}
              <button
                className="textbtn danger-text"
                onClick={async () => {
                  if (
                    confirm(
                      "¿Descartar el cronómetro? No se creará una sesión.",
                    )
                  ) {
                    await setTimer(null);
                    notify("Cronómetro descartado.");
                  }
                }}
              >
                Descartar sesión abierta
              </button>
            </>
          ) : (
            <Button onClick={() => void begin()}>
              <Play size={18} />
              Iniciar sesión
            </Button>
          )}
          <ErrorText error={error} />
          <div className="timer-note">
            <RotateCcw size={17} />
            <span>
              Tu sesión se recupera al recargar. Las pausas y los descansos no
              suman tiempo.
            </span>
          </div>
        </section>
        <section className="panel stack">
          <h2>{timer ? "Bloques de la sesión" : "¿En qué vas a trabajar?"}</h2>
          {timer ? (
            <div className="stack">
              {timer.nodeIds.map((id) => (
                <div className="task-row" key={id}>
                  <BookOpen size={18} />
                  <strong>
                    {data.nodes.find((n) => n.id === id)?.name ??
                      "Bloque archivado"}
                  </strong>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="segmented">
                {(["study", "review", "practice"] as const).map((k) => (
                  <button
                    className={kind === k ? "selected" : ""}
                    key={k}
                    onClick={() => setKind(k)}
                  >
                    {
                      {
                        study: "ESTUDIAR",
                        review: "REPASAR",
                        practice: "PRÁCTICA",
                      }[k]
                    }
                  </button>
                ))}
              </div>
              <BlockPicker
                nodes={blocks(data, oppositionId)}
                allNodes={data.nodes}
                selected={ids}
                onChange={setIds}
              />
              <Field label="Modo">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="continuous">Cronómetro continuo</option>
                  <option value="pomodoro">
                    Pomodoro · {preferences.pomodoroWork}/
                    {preferences.pomodoroBreak} min
                  </option>
                </select>
              </Field>
              <small className="muted">
                Puedes modificar los intervalos en Configuración.
              </small>
            </>
          )}
        </section>
      </div>
    </>
  );
}
