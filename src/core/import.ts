import Papa from "papaparse";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";
import { active, base, TABLES } from "./types";
import type { Node, DataSet, TableName, Base, Change } from "./types";
import { nodePath } from "./stats";
import { validateRow } from "./validation";
export interface TreeItem {
  name: string;
  kind: "container" | "block";
  children: TreeItem[];
}
const treeSchema: z.ZodType<TreeItem> = z.lazy(() =>
  z.object({
    name: z.string().trim().min(1).max(300),
    kind: z.enum(["container", "block"]),
    children: z.array(treeSchema),
  }),
);
const normalize = (v: any): TreeItem => {
  if (!v || typeof v !== "object")
    throw new Error("Cada nodo debe ser un objeto.");
  const children = (v.children ?? []).map(normalize);
  return treeSchema.parse({
    name: v.name,
    kind: v.kind ?? (children.length ? "container" : "block"),
    children,
  });
};
export function validateTree(tree: TreeItem[]) {
  let count = 0;
  function walk(items: TreeItem[], depth = 0) {
    if (depth > 30)
      throw new Error("Profundidad máxima de importación: 30 niveles.");
    const seen = new Set<string>();
    for (const n of items) {
      if (++count > 5000)
        throw new Error("Importa como máximo 5.000 elementos por lote.");
      const key = n.name.trim().toLocaleLowerCase("es");
      if (seen.has(key))
        throw new Error(`Nombre duplicado en el mismo nivel: ${n.name}`);
      seen.add(key);
      if (n.kind === "block" && n.children.length)
        throw new Error(`«${n.name}» tiene hijos y debe ser un contenedor.`);
      walk(n.children, depth + 1);
    }
  }
  walk(tree);
  if (!count) throw new Error("El árbol está vacío.");
  return count;
}
export function parseTree(
  input: string,
  format: "json" | "csv" | "text",
): TreeItem[] {
  let tree: TreeItem[] = [];
  if (format === "json") {
    const obj = JSON.parse(input);
    tree = (Array.isArray(obj) ? obj : (obj.nodes ?? obj.temario)).map(
      normalize,
    );
  } else if (format === "csv") {
    const csv = Papa.parse<Record<string, string>>(input, {
      header: true,
      skipEmptyLines: true,
    });
    if (csv.errors.length) throw new Error(csv.errors[0].message);
    if (!["id", "parent_id", "name"].every((k) => csv.meta.fields?.includes(k)))
      throw new Error("CSV: columnas id,parent_id,name,kind.");
    const map = new Map<string, TreeItem>(),
      parents = new Map<string, string>();
    for (const r of csv.data) {
      if (!r.id || map.has(r.id))
        throw new Error("Identificador CSV vacío o duplicado.");
      map.set(r.id, {
        name: r.name,
        kind: r.kind === "block" ? "block" : "container",
        children: [],
      });
      parents.set(r.id, r.parent_id?.trim() ?? "");
    }
    for (const [id, n] of map) {
      const p = parents.get(id)!;
      const visited = new Set([id]);
      let path = p;
      while (path) {
        if (visited.has(path)) throw new Error("Ciclo en CSV.");
        visited.add(path);
        if (!parents.has(path)) throw new Error("Padre CSV inexistente.");
        path = parents.get(path)!;
      }
      if (p) map.get(p)!.children.push(n);
      else tree.push(n);
    }
    for (const [id, n] of map)
      if (!csv.data.find((r) => r.id === id)!.kind)
        n.kind = n.children.length ? "container" : "block";
    tree = tree.map(normalize);
  } else {
    const stack: TreeItem[] = [];
    for (const line of input.split(/\r?\n/).filter((l) => l.trim())) {
      const ws = line.match(/^\s*/)?.[0].replace(/\t/g, "  ") ?? "";
      if (ws.length % 2)
        throw new Error("Utiliza sangrías de dos espacios o un tabulador.");
      const depth = ws.length / 2;
      if (depth > stack.length) throw new Error("La sangría salta un nivel.");
      const n: TreeItem = {
        name: line.trim().replace(/^[-•]\s*/, ""),
        kind: "block",
        children: [],
      };
      if (depth) {
        const p = stack[depth - 1];
        p.kind = "container";
        p.children.push(n);
      } else tree.push(n);
      stack[depth] = n;
      stack.length = depth + 1;
    }
  }
  validateTree(tree);
  return tree;
}
export function treeToNodes(
  tree: TreeItem[],
  owner: string,
  opposition: string,
  existing: Node[],
  parent: string | null = null,
): { rows: Node[]; duplicates: string[] } {
  const rows: Node[] = [],
    duplicates: string[] = [],
    existingPath = new Map(
      active(existing)
        .filter((n) => n.opposition_id === opposition)
        .map((n) => [nodePath(n, existing).toLocaleLowerCase("es"), n]),
    );
  const prefix = parent
    ? nodePath(existing.find((n) => n.id === parent)!, existing)
    : "";
  function walk(items: TreeItem[], pid: string | null, path: string) {
    items.forEach((item, index) => {
      const next = path ? path + " / " + item.name : item.name;
      const duplicate = existingPath.get(next.toLocaleLowerCase("es"));
      if (duplicate) {
        if (duplicate.kind !== item.kind || duplicate.archived)
          throw new Error(
            `«${next}» ya existe con otro tipo o está archivado. Renómbralo o restaura el nodo antes de importar.`,
          );
        duplicates.push(next);
        walk(item.children, duplicate.id, next);
        return;
      }
      const n: Node = {
        ...base(owner),
        opposition_id: opposition,
        parent_id: pid,
        source_node_id: null,
        name: item.name,
        kind: item.kind,
        position: index + existing.filter((n) => n.parent_id === pid).length,
        archived: false,
        importance: 3,
        estimated_minutes: 20,
        notes: "",
      };
      rows.push(n);
      walk(item.children, n.id, next);
    });
  }
  walk(tree, parent, prefix);
  return { rows, duplicates };
}
export interface Backup {
  format: "opoplan";
  version: 1;
  exported_at: string;
  source_owner: string;
  data: DataSet;
}
export function backup(d: DataSet, owner: string): Backup {
  return {
    format: "opoplan",
    version: 1,
    exported_at: new Date().toISOString(),
    source_owner: owner,
    data: { ...d, push_subscriptions: [] },
  };
}
export function parseBackup(text: string): Backup {
  const b = JSON.parse(text);
  if (
    b.format !== "opoplan" ||
    b.version !== 1 ||
    !b.data ||
    typeof b.source_owner !== "string"
  )
    throw new Error("Copia de OpoPlan no válida o versión incompatible.");
  for (const t of TABLES) {
    if (!Array.isArray(b.data[t])) throw new Error(`Falta la tabla ${t}.`);
    const ids = new Set();
    for (const r of b.data[t]) {
      if (
        !z.uuid().safeParse(r.id).success ||
        r.owner_id !== b.source_owner ||
        ids.has(r.id) ||
        typeof r.version !== "number"
      )
        throw new Error(`Registro inválido o duplicado en ${t}.`);
      ids.add(r.id);
      validateRow(t, r);
    }
  }
  const exists = (t: TableName, id: string) =>
    b.data[t].some((r: Base) => r.id === id);
  for (const t of TABLES)
    for (const row of b.data[t])
      for (const [key, target] of Object.entries(references))
        if (row[key] && !exists(target, row[key]))
          throw new Error(`Relación ausente: ${t}.${key}`);
  for (const n of b.data.nodes) {
    if (
      !n.name ||
      !["block", "container"].includes(n.kind) ||
      !exists("oppositions", n.opposition_id) ||
      (n.parent_id && !exists("nodes", n.parent_id))
    )
      throw new Error("Relaciones del temario incompletas.");
    if (n.parent_id) {
      const parent = b.data.nodes.find((p: Node) => p.id === n.parent_id);
      if (
        parent.kind !== "container" ||
        parent.opposition_id !== n.opposition_id
      )
        throw new Error("Padre incompatible con nodo.");
    }
    const seen = new Set([n.id]);
    let p = n.parent_id;
    while (p) {
      if (seen.has(p)) throw new Error("Ciclo en copia de seguridad.");
      seen.add(p);
      p = b.data.nodes.find((x: Node) => x.id === p)?.parent_id;
    }
  }
  for (const a of b.data.session_blocks)
    if (!exists("sessions", a.session_id) || !exists("nodes", a.node_id))
      throw new Error("Relaciones de sesión incompletas.");
  for (const e of b.data.memory_events)
    if (
      !exists("nodes", e.node_id) ||
      (e.session_id && !exists("sessions", e.session_id)) ||
      (e.target_event_id && !exists("memory_events", e.target_event_id))
    )
      throw new Error("Relaciones de repaso incompletas.");
  for (const session of b.data.sessions) {
    const assignments = b.data.session_blocks.filter(
      (a: any) => a.session_id === session.id && !a.deleted_at,
    );
    if (
      !session.deleted_at &&
      ((session.kind !== "practice" && !assignments.length) ||
        (assignments.length &&
          assignments.reduce(
            (sum: number, a: any) => sum + a.allocated_seconds,
            0,
          ) !== session.duration_seconds))
    )
      throw new Error("Reparto de tiempo incoherente en la copia.");
    for (const a of assignments) {
      const n = b.data.nodes.find((n: Node) => n.id === a.node_id);
      if (n.kind !== "block" || n.opposition_id !== session.opposition_id)
        throw new Error("Bloque incompatible con sesión.");
    }
  }
  for (const e of b.data.memory_events) {
    if (e.target_event_id) {
      const original = b.data.memory_events.find(
        (v: any) => v.id === e.target_event_id,
      );
      if (
        original.node_id !== e.node_id ||
        ["correction", "void"].includes(original.kind) ||
        (e.kind === "correction" && original.kind !== "review")
      )
        throw new Error("Corrección incompatible en la copia.");
    }
  }
  return b;
}
const references: Record<string, TableName> = {
  opposition_id: "oppositions",
  parent_id: "nodes",
  source_node_id: "nodes",
  node_id: "nodes",
  session_id: "sessions",
  planned_task_id: "plan_tasks",
  completed_session_id: "sessions",
  category_id: "categories",
  test_id: "test_results",
  target_event_id: "memory_events",
};
export function restoreChanges(b: Backup, owner: string, current: DataSet) {
  const mapping = new Map<string, string>();
  const same = b.source_owner === owner;
  for (const t of TABLES)
    for (const r of b.data[t])
      mapping.set(
        t + ":" + r.id,
        t === "profiles"
          ? owner
          : same
            ? r.id
            : uuidv5(t + ":" + b.source_owner + ":" + r.id, owner),
      );
  const changes: Change[] = [],
    duplicates: string[] = [];
  for (const t of TABLES) {
    if (t === "push_subscriptions") continue;
    for (const source of b.data[t]) {
      const row: any = {
        ...source,
        id: mapping.get(t + ":" + source.id),
        owner_id: owner,
      };
      for (const [key, target] of Object.entries(references))
        if (row[key]) {
          const next = mapping.get(target + ":" + row[key]);
          if (!next) throw new Error(`Relación ausente: ${t}.${key}`);
          row[key] = next;
        }
      const old = current[t].find((r) => r.id === row.id);
      if (old) {
        duplicates.push(`${t}: ${row.id}`);
        continue;
      }
      row.version = 0;
      changes.push({ table: t, row, expected_version: 0 });
    }
  }
  if (changes.length > 50000)
    throw new Error(
      "La copia supera el máximo de 50.000 registros por restauración. Conserva el archivo y solicita una restauración de base de datos.",
    );
  return { changes, duplicates };
}
export const toCSV = (rows: unknown[]) =>
  Papa.unparse(rows as object[], { escapeFormulae: true });
export function download(
  filename: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function calendarICS(
  tasks: {
    id: string;
    name: string;
    day: string;
    minutes: number;
    notes: string;
  }[],
) {
  const esc = (s: string) =>
    s
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OpoPlan//Agenda//ES",
    "CALSCALE:GREGORIAN",
    ...tasks.flatMap((t) => [
      "BEGIN:VEVENT",
      `UID:${t.id}@opoplan`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
      `DTSTART;VALUE=DATE:${t.day.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${new Date(new Date(t.day + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10).replace(/-/g, "")}`,
      `SUMMARY:${esc(t.name)}`,
      `DESCRIPTION:${esc(t.notes + " · " + t.minutes + " min")}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");
}
