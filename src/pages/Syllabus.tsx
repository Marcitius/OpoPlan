import { useState } from "react";
import {
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Folder,
  BookOpen,
  Upload,
  Download,
  Archive,
  RotateCcw,
} from "lucide-react";
import { useApp, change } from "../data/context";
import type { SessionOptions } from "../components/SessionForm";
import {
  Button,
  Modal,
  Field,
  ErrorText,
  Menu,
  Empty,
  ProgressBar,
} from "../components/ui";
import { base, active } from "../core/types";
import type { Node, Rating, MemoryEvent } from "../core/types";
import {
  blocks,
  getStates,
  descendants,
  nodePath,
  isActiveNode,
} from "../core/stats";
import { labelDay, dayAt, minutesLabel } from "../core/dates";
import { parseTree, treeToNodes, download } from "../core/import";
import type { TreeItem } from "../core/import";
import { mastery, effectiveEvents } from "../core/memory";
export function Syllabus({ start }: { start: (o: SessionOptions) => void }) {
  const { owner, data, oppositionId, commit, save, memory, preferences } =
    useApp();
  const [q, setQ] = useState(""),
    [expanded, setExpanded] = useState(new Set<string>()),
    [showArchived, setShowArchived] = useState(false),
    [trash, setTrash] = useState(false),
    [editing, setEditing] = useState<Node | null>(null),
    [editOpen, setEditOpen] = useState(false),
    [parent, setParent] = useState<string | null>(null),
    [detail, setDetail] = useState<Node | null>(null),
    [split, setSplit] = useState<Node | null>(null),
    [splitText, setSplitText] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [format, setFormat] = useState<"json" | "csv" | "text">("text"),
    [input, setInput] = useState(""),
    [preview, setPreview] = useState<TreeItem[] | null>(null),
    [previewRows, setPreviewRows] = useState<Node[]>([]),
    [duplicates, setDuplicates] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [correction, setCorrection] = useState<MemoryEvent | null>(null),
    [rating, setRating] = useState<Rating>("bien"),
    [correctionNote, setCorrectionNote] = useState("");
  const states = getStates(data),
    all = data.nodes.filter((n) => n.opposition_id === oppositionId),
    available = all.filter((n) =>
      trash
        ? !!n.deleted_at
        : !n.deleted_at && (showArchived || isActiveNode(n, all)),
    );
  function openEdit(n: Node | null, p: string | null = null) {
    setEditing(n);
    setParent(p);
    setError("");
    setEditOpen(true);
  }
  async function reorder(n: Node, delta: number) {
    const siblings = active(all)
      .filter((x) => x.parent_id === n.parent_id)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const i = siblings.findIndex((x) => x.id === n.id),
      j = i + delta;
    if (j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
    await commit(
      siblings.map((x, p) => change("nodes", { ...x, position: p })),
    );
  }
  async function remove(n: Node) {
    if (
      !confirm(
        `¿Mover «${n.name}» y sus hijos a la papelera? El historial se conservará.`,
      )
    )
      return;
    const now = new Date().toISOString();
    await commit(
      [n, ...descendants(n.id, all)].map((x) =>
        change("nodes", { ...x, deleted_at: now }),
      ),
    );
  }
  async function restore(n: Node) {
    await commit(
      [n, ...descendants(n.id, all)].map((x) =>
        change("nodes", { ...x, deleted_at: null }),
      ),
    );
  }
  const renderNodes = (pid: string | null, level = 0): React.ReactNode =>
    available
      .filter(
        (n) =>
          n.parent_id === pid ||
          (level === 0 && !available.some((x) => x.id === n.parent_id)),
      )
      .filter((n) => {
        if (!q) return true;
        return (
          nodePath(n, all).toLowerCase().includes(q.toLowerCase()) ||
          descendants(n.id, all).some((x) =>
            x.name.toLowerCase().includes(q.toLowerCase()),
          )
        );
      })
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
      .map((n) => {
        const children = available.some((x) => x.parent_id === n.id),
          opened = q || expanded.has(n.id),
          sub = [n, ...descendants(n.id, all)].filter(
            (x) => x.kind === "block" && isActiveNode(x, all),
          ),
          done = sub.filter((x) => states.get(x.id)?.studied).length,
          s = states.get(n.id)!;
        const partial = active(data.session_blocks).some(
          (a) => a.node_id === n.id && !a.completed,
        );
        return (
          <div key={n.id}>
            <div
              className={`tree-row ${n.archived ? "archived" : ""}`}
              style={{ "--depth": Math.min(level, 5) } as React.CSSProperties}
            >
              <button
                className="tree-toggle"
                aria-label={`${opened ? "Contraer" : "Expandir"} ${n.name}`}
                disabled={!children}
                onClick={() =>
                  setExpanded((v) => {
                    const copy = new Set(v);
                    copy.has(n.id) ? copy.delete(n.id) : copy.add(n.id);
                    return copy;
                  })
                }
              >
                {children ? (
                  opened ? (
                    <ChevronDown size={17} />
                  ) : (
                    <ChevronRight size={17} />
                  )
                ) : (
                  <span />
                )}
              </button>
              <span className={`node-icon ${n.kind}`}>
                {n.kind === "container" ? (
                  <Folder size={20} />
                ) : (
                  <BookOpen size={19} />
                )}
              </span>
              <button className="tree-name" onClick={() => setDetail(n)}>
                <strong>{n.name}</strong>
                <small>
                  {n.archived
                    ? "Archivado"
                    : n.kind === "container"
                      ? `${done}/${sub.length} bloques estudiados`
                      : s.studied
                        ? mastery(s)
                        : partial
                          ? "En estudio"
                          : "No empezado"}
                </small>
              </button>
              <div className="tree-progress">
                {n.kind === "container" ? (
                  <ProgressBar
                    value={sub.length ? (done / sub.length) * 100 : 0}
                  />
                ) : (
                  <span className={`badge ${s.rating ?? ""}`}>
                    {s.passes} pasada(s)
                  </span>
                )}
              </div>
              <Menu
                items={
                  trash
                    ? [{ label: "Restaurar", action: () => void restore(n) }]
                    : [
                        { label: "Editar / mover", action: () => openEdit(n) },
                        ...(n.kind === "container"
                          ? [
                              {
                                label: "Añadir hijo",
                                action: () => openEdit(null, n.id),
                              },
                            ]
                          : [
                              {
                                label: "Registrar estudio",
                                action: () =>
                                  start({ kind: "study", nodeIds: [n.id] }),
                              },
                              {
                                label: "Repasar",
                                action: () =>
                                  start({ kind: "review", nodeIds: [n.id] }),
                              },
                              {
                                label: "Dividir en bloques nuevos",
                                action: () => {
                                  setSplit(n);
                                  setSplitText("");
                                  setError("");
                                },
                              },
                            ]),
                        { label: "Subir", action: () => void reorder(n, -1) },
                        { label: "Bajar", action: () => void reorder(n, 1) },
                        {
                          label: n.archived ? "Desarchivar" : "Archivar",
                          action: () =>
                            void save("nodes", { ...n, archived: !n.archived }),
                        },
                        {
                          label: "Mover a papelera",
                          action: () => void remove(n),
                          danger: true,
                        },
                      ]
                }
              />
            </div>
            {children && opened && <div>{renderNodes(n.id, level + 1)}</div>}
          </div>
        );
      });
  function renderPreview(items: TreeItem[]): React.ReactNode {
    return (
      <ul className="preview-tree">
        {items.map((n, i) => (
          <li key={i}>
            {n.kind === "container" ? (
              <Folder size={16} />
            ) : (
              <BookOpen size={16} />
            )}
            <span>{n.name}</span>
            {n.children.length > 0 && renderPreview(n.children)}
          </li>
        ))}
      </ul>
    );
  }
  function exportTree(pid: string | null): TreeItem[] {
    return active(all)
      .filter((n) => n.parent_id === pid)
      .sort((a, b) => a.position - b.position)
      .map((n) => ({ name: n.name, kind: n.kind, children: exportTree(n.id) }));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TU MAPA DE ESTUDIO</div>
          <h1>El temario, a tu medida.</h1>
          <p>
            Organiza el contenido en bloques que puedas estudiar y repasar de
            verdad.
          </p>
        </div>
        <div className="heading-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setImportOpen(true);
              setError("");
              setPreview(null);
            }}
          >
            <Upload size={18} />
            Importar
          </Button>
          <Button onClick={() => openEdit(null)}>
            <Plus size={18} />
            Añadir
          </Button>
        </div>
      </div>
      <div className="toolbar">
        <div className="search">
          <Search size={18} />
          <input
            aria-label="Buscar temario"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar materia, tema o bloque…"
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Archivados
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={trash}
            onChange={(e) => setTrash(e.target.checked)}
          />
          Papelera
        </label>
        <Button
          variant="ghost"
          onClick={() =>
            download(
              "OpoPlan-temario.json",
              JSON.stringify({ nodes: exportTree(null) }, null, 2),
            )
          }
        >
          <Download size={17} />
          Exportar
        </Button>
      </div>
      <section className="panel tree-panel">
        <div className="section-title">
          <h2>{data.oppositions.find((o) => o.id === oppositionId)?.name}</h2>
          <span className="badge">
            {blocks(data, oppositionId).length} bloques activos
          </span>
        </div>
        {available.length ? (
          renderNodes(null)
        ) : (
          <Empty
            title="Empieza por un bloque"
            description="Crea una materia y sus bloques, o importa tu estructura de una sola vez."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setImportOpen(true);
                  setPreview(null);
                }}
              >
                Importar temario
              </Button>
            }
          />
        )}
      </section>
      <Modal
        title={editing ? "Editar elemento" : "Añadir elemento"}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      >
        <NodeForm
          key={editing?.id ?? parent ?? "new"}
          node={editing}
          parent={parent}
          onDone={() => setEditOpen(false)}
        />
      </Modal>
      <Modal
        title="Importar temario"
        open={importOpen}
        onClose={() => setImportOpen(false)}
        wide
      >
        <div className="stack">
          <p className="help">
            JSON con name, kind y children. CSV con id,parent_id,name,kind.
            Texto con dos espacios de sangría por nivel.
          </p>
          <div className="form-grid">
            <Field label="Formato">
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as typeof format);
                  setPreview(null);
                }}
              >
                <option value="text">Texto con sangrías</option>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </Field>
            <Field label="Archivo (opcional)">
              <input
                type="file"
                accept=".json,.csv,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setInput(await f.text());
                    setFormat(
                      f.name.endsWith(".json")
                        ? "json"
                        : f.name.endsWith(".csv")
                          ? "csv"
                          : "text",
                    );
                    setPreview(null);
                  }
                }}
              />
            </Field>
          </div>
          <Field label="Pega tu estructura">
            <textarea
              rows={9}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setPreview(null);
              }}
              placeholder={"Materia\n  Tema\n    Bloque"}
            />
          </Field>
          <Button
            variant="secondary"
            onClick={() => {
              try {
                const t = parseTree(input, format),
                  result = treeToNodes(t, owner, oppositionId, all);
                setPreview(t);
                setPreviewRows(result.rows);
                setDuplicates(result.duplicates);
                setError("");
              } catch (err) {
                setPreview(null);
                setError((err as Error).message);
              }
            }}
          >
            Validar y previsualizar
          </Button>
          {preview && (
            <div className="import-preview">
              <h3>
                {previewRows.length} elementos nuevos · {duplicates.length} ya
                existentes
              </h3>
              {renderPreview(preview)}
              {duplicates.length > 0 && (
                <p className="help">
                  Se omiten los nombres ya existentes en la misma ruta. Se
                  conservarán sus registros.
                </p>
              )}
              <Button
                disabled={busy || !previewRows.length}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await commit(previewRows.map((n) => change("nodes", n)));
                    setImportOpen(false);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirmar importación
              </Button>
            </div>
          )}
          <ErrorText error={error} />
        </div>
      </Modal>
      <Modal
        title="Dividir bloque"
        open={!!split}
        onClose={() => setSplit(null)}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const names = splitText
                .split("\n")
                .map((n) => n.trim())
                .filter(Boolean);
              if (names.length < 2)
                throw new Error("Introduce al menos dos nombres.");
              if (
                new Set(names.map((n) => n.toLowerCase())).size !== names.length
              )
                throw new Error("Los nombres no pueden repetirse.");
              const children = names.map(
                (name, i): Node => ({
                  ...base(owner),
                  opposition_id: oppositionId,
                  parent_id: split!.parent_id,
                  source_node_id: split!.id,
                  name,
                  kind: "block",
                  position: split!.position + i + 1,
                  archived: false,
                  importance: split!.importance,
                  estimated_minutes: split!.estimated_minutes,
                  notes: "",
                }),
              );
              await commit([
                change("nodes", { ...split!, archived: true }),
                ...children.map((n) => change("nodes", n)),
              ]);
              setSplit(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <strong>{split?.name}</strong>
          <p>
            El bloque original quedará archivado con su historial. Los nuevos
            bloques empezarán sin estudio ni dominio atribuidos.
          </p>
          <Field label="Un nombre por línea">
            <textarea
              rows={6}
              required
              value={splitText}
              onChange={(e) => setSplitText(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button>Crear bloques independientes</Button>
        </form>
      </Modal>
      <Modal
        title={detail?.name ?? "Detalle"}
        open={!!detail}
        onClose={() => setDetail(null)}
        wide
      >
        {detail && (
          <div className="stack">
            <p className="muted">{nodePath(detail, all)}</p>
            {detail.kind === "block" && (
              <>
                <div className="chips">
                  <span className="badge">
                    {states.get(detail.id)?.passes ?? 0} pasada(s)
                  </span>
                  <span className="badge">
                    {mastery(states.get(detail.id)!)}
                  </span>
                </div>
                <p>{states.get(detail.id)?.reason}</p>
                <div className="heading-actions">
                  <Button
                    onClick={() => {
                      setDetail(null);
                      start({ kind: "study", nodeIds: [detail.id] });
                    }}
                  >
                    Estudiar
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDetail(null);
                      start({ kind: "review", nodeIds: [detail.id] });
                    }}
                  >
                    Repasar
                  </Button>
                </div>
              </>
            )}
            <h3>Historial de sesiones</h3>
            {active(data.session_blocks)
              .filter((a) => a.node_id === detail.id)
              .map((a) => {
                const s = data.sessions.find((s) => s.id === a.session_id);
                return s && !s.deleted_at ? (
                  <div className="history-row" key={a.id}>
                    <strong>
                      {labelDay(dayAt(s.started_at, preferences.timezone))}
                    </strong>
                    <span>
                      {
                        {
                          study: "Estudio",
                          review: "Repaso",
                          practice: "Práctica",
                        }[s.kind]
                      }{" "}
                      ·{" "}
                      {a.completed
                        ? "Estudio inicial completado"
                        : `${a.progress}% de avance indicado`}
                    </span>
                    <span>{minutesLabel(a.allocated_seconds)} asignados</span>
                  </div>
                ) : null;
              })}
            <h3>Eventos de memoria</h3>
            {effectiveEvents(
              data.memory_events.filter((e) => e.node_id === detail.id),
            )
              .reverse()
              .map((e) => (
                <div className="history-row" key={e.id}>
                  <strong>{labelDay(e.study_day)}</strong>
                  <span>
                    {e.kind === "review"
                      ? e.rating?.toUpperCase()
                      : {
                          study: "Estudio inicial",
                          reschedule: "Fecha manual",
                          reset: "Reinicio",
                          exclude: "Excluido",
                          include: "Activado",
                          correction: "Corrección",
                          void: "Anulación",
                        }[e.kind]}
                    {e.manual_due && ` → ${labelDay(e.manual_due)}`}
                    <small>
                      {e.notes}
                      {e.scheduled_due &&
                        ` · Próximo repaso al registrar: ${labelDay(e.scheduled_due)}`}
                    </small>
                  </span>
                  <Menu
                    items={[
                      ...(e.kind === "review"
                        ? [
                            {
                              label: "Corregir valoración",
                              action: () => {
                                setCorrection(e);
                                setRating(e.rating!);
                                setCorrectionNote(e.notes);
                              },
                            },
                          ]
                        : []),
                      {
                        label: "Anular evento erróneo",
                        action: () => {
                          if (
                            confirm(
                              "¿Anular este evento? Quedará constancia de la corrección.",
                            )
                          )
                            void memory(detail, "void", {
                              target_event_id: e.id,
                            });
                        },
                        danger: true,
                      },
                    ]}
                  />
                </div>
              ))}
            <p className="help">
              Los cambios de valoración y anulaciones se añaden al historial. El
              registro original se conserva.
            </p>
          </div>
        )}
      </Modal>
      <Modal
        title="Corregir valoración"
        open={!!correction}
        onClose={() => setCorrection(null)}
      >
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const n = all.find((n) => n.id === correction!.node_id)!;
              await memory(n, "correction", {
                target_event_id: correction!.id,
                rating,
                notes: correctionNote,
              });
              setCorrection(null);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <Field label="Valoración correcta">
            <select
              value={rating}
              onChange={(e) => setRating(e.target.value as Rating)}
            >
              <option value="mal">Mal</option>
              <option value="regular">Regular</option>
              <option value="bien">Bien</option>
            </select>
          </Field>
          <Field label="Comentario">
            <textarea
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
            />
          </Field>
          <ErrorText error={error} />
          <Button>Guardar corrección</Button>
        </form>
      </Modal>
    </>
  );
}
function NodeForm({
  node,
  parent,
  onDone,
}: {
  node: Node | null;
  parent: string | null;
  onDone: () => void;
}) {
  const { owner, data, oppositionId, save } = useApp(),
    [name, setName] = useState(node?.name ?? ""),
    [kind, setKind] = useState<"block" | "container">(
      node?.kind ?? "container",
    ),
    [parentId, setParent] = useState(node?.parent_id ?? parent ?? ""),
    [importance, setImportance] = useState(node?.importance ?? 3),
    [minutes, setMinutes] = useState(node?.estimated_minutes ?? 20),
    [notes, setNotes] = useState(node?.notes ?? ""),
    [error, setError] = useState("");
  const forbidden = new Set(
    node ? [node.id, ...descendants(node.id, data.nodes).map((n) => n.id)] : [],
  );
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (
            kind === "block" &&
            node &&
            descendants(node.id, data.nodes).length
          )
            throw new Error("Un bloque revisable no puede contener hijos.");
          if (
            active(data.nodes).some(
              (n) =>
                n.id !== node?.id &&
                n.opposition_id === oppositionId &&
                n.parent_id === (parentId || null) &&
                n.name.trim().toLowerCase() === name.trim().toLowerCase(),
            )
          )
            throw new Error(
              "Ya existe un elemento con ese nombre en este nivel.",
            );
          const row: Node = {
            ...(node ?? base(owner)),
            opposition_id: oppositionId,
            parent_id: parentId || null,
            source_node_id: node?.source_node_id ?? null,
            name: name.trim(),
            kind,
            position:
              node?.position ??
              data.nodes.filter((n) => n.parent_id === (parentId || null))
                .length,
            archived: node?.archived ?? false,
            importance,
            estimated_minutes: minutes,
            notes,
          };
          await save("nodes", row);
          onDone();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <Field label="Nombre">
        <input
          required
          maxLength={300}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="Tipo">
        <select
          value={kind}
          disabled={
            !!node && data.memory_events.some((e) => e.node_id === node.id)
          }
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          <option value="container">
            Contenedor · materia, tema, título, capítulo…
          </option>
          <option value="block">
            Bloque revisable · unidad efectiva de estudio
          </option>
        </select>
      </Field>
      <Field label="Ubicación">
        <select value={parentId} onChange={(e) => setParent(e.target.value)}>
          <option value="">Raíz de la oposición</option>
          {active(data.nodes)
            .filter(
              (n) =>
                n.opposition_id === oppositionId &&
                n.kind === "container" &&
                !forbidden.has(n.id) &&
                !n.archived,
            )
            .map((n) => (
              <option key={n.id} value={n.id}>
                {nodePath(n, data.nodes)}
              </option>
            ))}
        </select>
      </Field>
      {kind === "block" && (
        <div className="form-grid">
          <Field label="Importancia (1–5)">
            <input
              type="number"
              min="1"
              max="5"
              value={importance}
              onChange={(e) => setImportance(+e.target.value)}
            />
          </Field>
          <Field label="Minutos estimados de repaso">
            <input
              type="number"
              min="1"
              max="1440"
              value={minutes}
              onChange={(e) => setMinutes(+e.target.value)}
            />
          </Field>
        </div>
      )}
      <Field label="Notas">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <ErrorText error={error} />
      <Button>Guardar elemento</Button>
    </form>
  );
}
