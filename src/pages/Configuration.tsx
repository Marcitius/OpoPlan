import { useEffect, useState } from "react";
import {
  Cloud,
  RefreshCw,
  Download,
  Upload,
  Bell,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useApp, change } from "../data/context";
import { Button, Field, ErrorText, Modal } from "../components/ui";
import { active, base } from "../core/types";
import type { Preferences, Operation, Change } from "../core/types";
import {
  backup,
  download,
  parseBackup,
  restoreChanges,
  toCSV,
} from "../core/import";
import { dayAt } from "../core/dates";
import { readData } from "../data/local";
const timezoneOptions = [
  "Europe/Madrid",
  "Atlantic/Canary",
  "Europe/London",
  "Europe/Paris",
  "America/Mexico_City",
  "America/Bogota",
  "America/Argentina/Buenos_Aires",
  "America/New_York",
  "UTC",
];
export function Configuration() {
  const {
    data,
    owner,
    oppositionId,
    preferences,
    save,
    commit,
    sync,
    retry,
    resolve,
    notify,
    client,
  } = useApp();
  const profile = data.profiles.find((p) => p.id === owner),
    opp = data.oppositions.find((o) => o.id === oppositionId),
    [prefs, setPrefs] = useState<Preferences>(structuredClone(preferences)),
    [name, setName] = useState(opp?.name ?? ""),
    [exam, setExam] = useState(opp?.exam_date ?? ""),
    [displayName, setDisplayName] = useState(profile?.display_name ?? ""),
    [newOpp, setNewOpp] = useState(""),
    [newCategory, setNewCategory] = useState(""),
    [error, setError] = useState(""),
    [backupText, setBackupText] = useState(""),
    [importPreview, setImportPreview] = useState<{
      changes: Change[];
      duplicates: string[];
    } | null>(null),
    [vapid, setVapid] = useState(
      import.meta.env.VITE_VAPID_PUBLIC_KEY ??
        localStorage.getItem("opoplan-vapid") ??
        "",
    ),
    [pushMessage, setPushMessage] = useState(""),
    [conflict, setConflict] = useState<Operation | null>(null),
    [busy, setBusy] = useState(false),
    [profileBase, setProfileBase] = useState(profile),
    [oppBase, setOppBase] = useState(opp);
  useEffect(() => {
    setOppBase(opp);
    setName(opp?.name ?? "");
    setExam(opp?.exam_date ?? "");
  }, [oppositionId]);
  async function registerPush() {
    setPushMessage("");
    try {
      const isIOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (isIOS && !matchMedia("(display-mode: standalone)").matches) {
        setPushMessage(
          "En iPhone/iPad, añade OpoPlan a la pantalla de inicio y abre la aplicación instalada. Puedes usar los avisos dentro de la aplicación y exportar la agenda mientras tanto.",
        );
        return;
      }
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setPushMessage(
          "Este navegador no admite notificaciones push. Usa los avisos de Hoy y exporta tu agenda al calendario.",
        );
        return;
      }
      if (!vapid.trim())
        throw new Error(
          "Falta la clave VAPID pública del emisor. Consulta la guía de despliegue.",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushMessage(
          "Permiso no concedido. Los avisos dentro de la aplicación siguen disponibles.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(vapid.trim().replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const existing = data.push_subscriptions.find(
        (row) => row.endpoint === subscription.endpoint,
      );
      await save("push_subscriptions", {
        ...(existing ?? base(owner)),
        deleted_at: null,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
        last_sent_day: existing?.last_sent_day ?? null,
      });
      localStorage.setItem("opoplan-vapid", vapid.trim());
      setPushMessage(
        "Suscripción guardada en este dispositivo. Su envío requiere sincronización, la función send-reminders y el cron configurado. La recepción aún no está comprobada.",
      );
    } catch (err) {
      setPushMessage((err as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU PREPARACIÓN, TUS REGLAS</div>
          <h1>Ajusta tu plan.</h1>
          <p>Objetivos, memoria, dispositivos y copias de seguridad.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel stack">
          <div className="section-title">
            <h2>Sincronización</h2>
            <Cloud size={20} />
          </div>
          <div className={`sync-banner ${sync.status}`}>
            <strong>
              {
                {
                  loading: "Cargando",
                  synced: "Sincronizado",
                  pending: "Cambios pendientes",
                  offline: "Sin conexión",
                  error: "Error de sincronización",
                  conflict: "Conflicto que requiere atención",
                }[sync.status]
              }
            </strong>
            <span>{sync.count} operación(es) pendiente(s)</span>
          </div>
          {sync.error && <p className="error">{sync.error}</p>}
          <p className="help">
            Los cambios se conservan en este dispositivo hasta que Supabase
            confirma el guardado. Accede con la misma cuenta en los demás
            dispositivos.
          </p>
          <Button variant="secondary" onClick={retry}>
            <RefreshCw size={17} />
            Sincronizar ahora
          </Button>
          {sync.operations.map((op) => (
            <div className="operation" key={op.id}>
              <small>{op.id}</small>
              <span>
                {op.changes.length} registro(s) · {op.attempts} reintento(s)
              </span>
              {op.error && <p>{op.error}</p>}
              {op.conflicts && (
                <Button variant="secondary" onClick={() => setConflict(op)}>
                  Revisar conflicto
                </Button>
              )}
            </div>
          ))}
          <div className="help security-note">
            <ShieldCheck size={17} />
            Tu historial se guarda por cuenta. Las ediciones utilizan control de
            versiones.
          </div>
        </section>
        <section className="panel stack">
          <h2>Mi oposición</h2>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await commit([
                  change("oppositions", {
                    ...oppBase!,
                    name: name.trim(),
                    exam_date: exam || null,
                  }),
                  change("profiles", {
                    ...profileBase!,
                    display_name: displayName,
                  }),
                ]);
                const local = await readData(owner);
                setProfileBase(local.profiles.find((p) => p.id === owner));
                setOppBase(
                  local.oppositions.find((o) => o.id === oppositionId),
                );
                setError("");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Field label="Tu nombre (opcional)">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            <Field label="Oposición">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Fecha prevista de examen">
              <input
                type="date"
                value={exam}
                onChange={(e) => setExam(e.target.value)}
              />
            </Field>
            <Button>Guardar oposición</Button>
          </form>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save("oppositions", {
                  ...base(owner),
                  name: newOpp.trim(),
                  exam_date: null,
                  archived: false,
                });
                setNewOpp("");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <input
              aria-label="Nombre de otra oposición"
              required
              placeholder="Otra oposición"
              value={newOpp}
              onChange={(e) => setNewOpp(e.target.value)}
            />
            <Button variant="secondary">
              <Plus size={17} />
              Crear
            </Button>
          </form>
        </section>
        <section className="panel stack">
          <h2>Objetivos y preferencias</h2>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                new Intl.DateTimeFormat("es", { timeZone: prefs.timezone });
                if (
                  prefs.rules.firstDays > prefs.rules.maxDays ||
                  prefs.rules.secondDays > prefs.rules.maxDays
                )
                  throw new Error(
                    "El intervalo máximo debe ser igual o mayor que los primeros intervalos.",
                  );
                await save("profiles", { ...profileBase!, preferences: prefs });
                setProfileBase(
                  (await readData(owner)).profiles.find((p) => p.id === owner),
                );
                setError("");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Minutos objetivo al día">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={prefs.dailyMinutes}
                  onChange={(e) =>
                    setPrefs({ ...prefs, dailyMinutes: +e.target.value })
                  }
                />
              </Field>
              <Field label="Minutos objetivo a la semana">
                <input
                  type="number"
                  min="0"
                  max="10080"
                  value={prefs.weeklyMinutes}
                  onChange={(e) =>
                    setPrefs({ ...prefs, weeklyMinutes: +e.target.value })
                  }
                />
              </Field>
              <Field label="Máximo orientativo de repaso al día">
                <input
                  type="number"
                  min="0"
                  max="1440"
                  value={prefs.reviewMinutes}
                  onChange={(e) =>
                    setPrefs({ ...prefs, reviewMinutes: +e.target.value })
                  }
                />
              </Field>
              <Field label="Zona horaria">
                <select
                  value={prefs.timezone}
                  onChange={(e) =>
                    setPrefs({ ...prefs, timezone: e.target.value })
                  }
                >
                  {[...new Set([...timezoneOptions, prefs.timezone])].map(
                    (t) => (
                      <option key={t}>{t}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Tema visual">
                <select
                  value={prefs.theme}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      theme: e.target.value as Preferences["theme"],
                    })
                  }
                >
                  <option value="auto">Automático</option>
                  <option value="light">Claro</option>
                  <option value="dark">Oscuro</option>
                </select>
              </Field>
              <Field label="Idioma">
                <select>
                  <option>Español</option>
                </select>
              </Field>
              <Field label="Pomodoro · trabajo (min)">
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={prefs.pomodoroWork}
                  onChange={(e) =>
                    setPrefs({ ...prefs, pomodoroWork: +e.target.value })
                  }
                />
              </Field>
              <Field label="Pomodoro · descanso (min)">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={prefs.pomodoroBreak}
                  onChange={(e) =>
                    setPrefs({ ...prefs, pomodoroBreak: +e.target.value })
                  }
                />
              </Field>
            </div>
            <div>
              <strong>Días de estudio</strong>
              <div className="day-picker">
                {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map(
                  (d, i) => (
                    <button
                      type="button"
                      className={prefs.studyDays.includes(i) ? "selected" : ""}
                      key={d}
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          studyDays: prefs.studyDays.includes(i)
                            ? prefs.studyDays.filter((x) => x !== i)
                            : [...prefs.studyDays, i],
                        })
                      }
                    >
                      {d}
                    </button>
                  ),
                )}
              </div>
              <p className="help">
                Los días no seleccionados son días de descanso. Los repasos
                vencidos se mantienen visibles.
              </p>
            </div>
            <h3>Repetición espaciada · SM-2 adaptado, versión 1</h3>
            <div className="form-grid">
              <Field label="Primer intervalo (días)">
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={prefs.rules.firstDays}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      rules: { ...prefs.rules, firstDays: +e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Segundo intervalo con Bien (días)">
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={prefs.rules.secondDays}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      rules: { ...prefs.rules, secondDays: +e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Intervalo máximo (días)">
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={prefs.rules.maxDays}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      rules: { ...prefs.rules, maxDays: +e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Multiplicador Regular">
                <input
                  type="number"
                  min="1"
                  max="2"
                  step="0.05"
                  value={prefs.rules.regularMultiplier}
                  onChange={(e) =>
                    setPrefs({
                      ...prefs,
                      rules: {
                        ...prefs.rules,
                        regularMultiplier: +e.target.value,
                      },
                    })
                  }
                />
              </Field>
            </div>
            <p className="help">
              MAL = 1/5: vuelve al primer intervalo y reduce facilidad. REGULAR
              = 3/5: avance conservador. BIEN = 5/5: primero 1 día, después 6, y
              luego intervalo × facilidad. Los cambios se aplican a nuevos
              eventos; cada registro conserva sus reglas.
            </p>
            <Button>Guardar preferencias</Button>
          </form>
        </section>
        <section className="panel stack">
          <div className="section-title">
            <h2>Avisos y recordatorios</h2>
            <Bell size={20} />
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.reminders}
              onChange={(e) =>
                setPrefs({ ...prefs, reminders: e.target.checked })
              }
            />
            Activar recordatorios (guardar preferencias)
          </label>
          <Field label="Hora del resumen diario (0–23)">
            <input
              type="number"
              min="0"
              max="23"
              value={prefs.reminderHour}
              onChange={(e) =>
                setPrefs({ ...prefs, reminderHour: +e.target.value })
              }
            />
          </Field>
          <p className="help">
            Los pendientes y vencidos aparecen siempre en Hoy. Los avisos
            externos necesitan permiso del dispositivo y un emisor configurado.
          </p>
          <Field label="Clave VAPID pública">
            <input
              value={vapid}
              onChange={(e) => setVapid(e.target.value)}
              placeholder="Clave pública del emisor push"
            />
          </Field>
          <Button variant="secondary" onClick={() => void registerPush()}>
            Activar push en este dispositivo
          </Button>
          {pushMessage && (
            <p className="help" role="status">
              {pushMessage}
            </p>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const reg = await navigator.serviceWorker.ready;
                const subscription = await reg.pushManager.getSubscription();
                if (subscription) {
                  await subscription.unsubscribe();
                  const row = data.push_subscriptions.find(
                    (s) =>
                      s.endpoint === subscription.endpoint && !s.deleted_at,
                  );
                  if (row)
                    await save("push_subscriptions", {
                      ...row,
                      deleted_at: new Date().toISOString(),
                    });
                }
                setPushMessage("Push desactivado en este dispositivo.");
              } catch (err) {
                setPushMessage((err as Error).message);
              }
            }}
          >
            Desactivar push
          </Button>
          <h3>Instalar en iPhone</h3>
          <p className="help">
            Abre OpoPlan en Safari → Compartir → Añadir a pantalla de inicio.
            Inicia sesión con tu misma cuenta. En iPad, Mac y Windows puedes
            instalarla desde el menú del navegador cuando sea compatible.
          </p>
        </section>
        <section className="panel stack">
          <h2>Copias de seguridad</h2>
          <p className="help">
            Incluye temario, relaciones, sesiones, repasos, agenda, resultados,
            preferencias e instantáneas. Excluye tokens de acceso y
            suscripciones push de este dispositivo.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              download(
                "OpoPlan-copia-" +
                  dayAt(new Date(), preferences.timezone) +
                  ".json",
                JSON.stringify(backup(data, owner), null, 2),
              )
            }
          >
            <Download size={17} />
            Descargar copia completa
          </Button>
          <div className="heading-actions">
            <Button
              variant="ghost"
              onClick={() =>
                download(
                  "OpoPlan-repasos.csv",
                  toCSV(data.memory_events),
                  "text/csv",
                )
              }
            >
              Repasos CSV
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                download("OpoPlan-temario.csv", toCSV(data.nodes), "text/csv")
              }
            >
              Temario CSV
            </Button>
          </div>
          <Field label="Importar copia JSON">
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setBackupText(await f.text());
                  setImportPreview(null);
                }
              }}
            />
          </Field>
          <Field label="O pega el JSON">
            <textarea
              rows={4}
              value={backupText}
              onChange={(e) => {
                setBackupText(e.target.value);
                setImportPreview(null);
              }}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              try {
                setImportPreview(
                  restoreChanges(parseBackup(backupText), owner, data),
                );
                setError("");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Upload size={17} />
            Validar y previsualizar copia
          </Button>
          {importPreview && (
            <div className="import-preview">
              <h3>{importPreview.changes.length} registros nuevos</h3>
              <p>
                {importPreview.duplicates.length} identificadores ya existentes
                se conservarán. La importación es un solo lote y no reemplaza
                datos existentes.
              </p>
              <ul>
                {[...new Set(importPreview.changes.map((c) => c.table))].map(
                  (t) => (
                    <li key={t}>
                      {t}:{" "}
                      {
                        importPreview.changes.filter((c) => c.table === t)
                          .length
                      }
                    </li>
                  ),
                )}
              </ul>
              <Button
                disabled={busy || !importPreview.changes.length}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await commit(importPreview.changes);
                    setImportPreview(null);
                    setBackupText("");
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirmar restauración
              </Button>
            </div>
          )}
        </section>
        <section className="panel stack">
          <h2>Categorías de práctica</h2>
          {active(data.categories).map((c) => (
            <div className="inline-form" key={c.id}>
              <input
                aria-label={"Nombre de " + c.name}
                defaultValue={c.name}
                onBlur={async (e) => {
                  if (
                    e.target.value.trim() &&
                    e.target.value.trim() !== c.name
                  ) {
                    try {
                      await save("categories", {
                        ...c,
                        name: e.target.value.trim(),
                      });
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }
                }}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  if (
                    confirm(
                      "¿Archivar la categoría? Se conservarán los resultados.",
                    )
                  )
                    void save("categories", {
                      ...c,
                      deleted_at: new Date().toISOString(),
                    });
                }}
              >
                Archivar
              </Button>
            </div>
          ))}
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save("categories", {
                  ...base(owner),
                  name: newCategory.trim(),
                  color: "#287462",
                });
                setNewCategory("");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <input
              aria-label="Nueva categoría"
              placeholder="Nueva categoría"
              required
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <Button variant="secondary">Añadir</Button>
          </form>
          <h3>Cuenta</h3>
          <p className="help">
            La recuperación de contraseña está disponible en la pantalla de
            acceso. Tus datos se vinculan a la cuenta de correo de Supabase.
          </p>
          <Button
            variant="ghost"
            onClick={async () => {
              const { data } = await client.auth.getUser();
              if (data.user?.email) {
                const { error } = await client.auth.resetPasswordForEmail(
                  data.user.email,
                  { redirectTo: location.origin },
                );
                notify(
                  error ? error.message : "Enlace de recuperación enviado.",
                );
              }
            }}
          >
            Enviar enlace de recuperación
          </Button>
        </section>
      </div>
      <ErrorText error={error} />
      <Modal
        title="Resolver conflicto"
        open={!!conflict}
        onClose={() => setConflict(null)}
        wide
      >
        {conflict && (
          <div className="stack">
            <p>
              La misma información ha cambiado en otro dispositivo. Elige qué
              versión conservar para el lote completo.
            </p>
            {conflict.conflicts?.map((c) => (
              <div key={c.table + c.id} className="conflict-row">
                <h3>
                  {c.table} · {c.id.slice(0, 8)}
                </h3>
                <div className="form-grid">
                  <div>
                    <strong>Este dispositivo</strong>
                    <pre>
                      {JSON.stringify(
                        conflict.changes.find(
                          (x) => x.table === c.table && x.row.id === c.id,
                        )?.row,
                        null,
                        2,
                      )}
                    </pre>
                  </div>
                  <div>
                    <strong>Nube · versión {c.actual}</strong>
                    <pre>{JSON.stringify(c.remote, null, 2)}</pre>
                  </div>
                </div>
              </div>
            ))}
            <p className="help">
              Si hay cambios posteriores sobre estas filas, la resolución se
              detendrá para conservarlos. Exporta una copia antes de descartar
              datos.
            </p>
            <ErrorText error={error} />
            <div className="heading-actions">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await resolve(conflict, "cloud");
                    setConflict(null);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Conservar versión de la nube
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await resolve(conflict, "local");
                    setConflict(null);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Conservar mis cambios y reenviar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
