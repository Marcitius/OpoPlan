import { openDB } from "idb";
import type {
  Base,
  DataSet,
  Operation,
  TableName,
  Change,
  Conflict,
} from "../core/types";
import { TABLES, emptyData } from "../core/types";
import type { Timer } from "../core/timer";
import { validateRow } from "../core/validation";
const database = () =>
  openDB("opoplan-v1", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const r = db.createObjectStore("records", { keyPath: "key" });
        r.createIndex("owner", "owner_id");
        const o = db.createObjectStore("outbox", { keyPath: "id" });
        o.createIndex("owner", "owner_id");
        db.createObjectStore("timers");
      }
      if (oldVersion < 2) db.createObjectStore("meta");
    },
  });
export async function readData(owner: string): Promise<DataSet> {
  const db = await database(),
    rows = await db.getAllFromIndex("records", "owner", owner),
    d = emptyData();
  for (const r of rows)
    if (TABLES.includes(r.table))
      (d[r.table as TableName] as Base[]).push(r.row);
  return d;
}
export async function pending(owner: string): Promise<Operation[]> {
  const db = await database();
  return (await db.getAllFromIndex("outbox", "owner", owner)).sort(
    (a, b) =>
      (a.queue_order ?? 0) - (b.queue_order ?? 0) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
}
export async function enqueue(
  owner: string,
  changes: Change[],
): Promise<Operation> {
  if (!changes.length || changes.length > 50000)
    throw new Error("Un lote debe contener entre 1 y 50.000 registros.");
  for (const c of changes) validateRow(c.table, c.row);
  if (changes.some((c) => c.row.owner_id !== owner))
    throw new Error("Datos de otra cuenta.");
  if (
    new Set(changes.map((c) => c.table + ":" + c.row.id)).size !==
    changes.length
  )
    throw new Error("Registro duplicado dentro del lote.");
  const db = await database(),
    tx = db.transaction(["records", "outbox", "meta"], "readwrite"),
    now = new Date().toISOString();
  try {
    const seq =
      ((await tx.objectStore("meta").get("sequence:" + owner)) ?? 0) + 1;
    const operation: Operation = {
      id: crypto.randomUUID(),
      owner_id: owner,
      changes,
      created_at: now,
      attempts: 0,
      next_attempt: 0,
      error: null,
      queue_order: seq,
    };
    for (const c of changes) {
      const key = [owner, c.table, c.row.id].join(":");
      const existing = await tx.objectStore("records").get(key);
      if ((existing?.row.version ?? 0) !== c.expected_version)
        throw new Error(
          "Este registro ha cambiado. Vuelve a abrirlo antes de guardar.",
        );
      await tx
        .objectStore("records")
        .put({
          key,
          owner_id: owner,
          table: c.table,
          row: { ...c.row, version: c.expected_version + 1, updated_at: now },
        });
    }
    await tx.objectStore("meta").put(seq, "sequence:" + owner);
    await tx.objectStore("outbox").put(operation);
    await tx.done;
    return operation;
  } catch (error) {
    tx.abort();
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function saveOperation(op: Operation) {
  const db = await database();
  await db.put("outbox", op);
}
export async function acknowledge(id: string) {
  const db = await database();
  await db.delete("outbox", id);
}
export async function mergeCloud(owner: string, data: Partial<DataSet>) {
  for (const table of TABLES)
    for (const row of data[table] ?? []) {
      validateRow(table, row);
      if (row.owner_id !== owner)
        throw new Error("Respuesta de cuenta inesperada.");
    }
  const db = await database(),
    ops = await pending(owner),
    dirty = new Set(
      ops.flatMap((o) => o.changes.map((c) => c.table + ":" + c.row.id)),
    ),
    tx = db.transaction("records", "readwrite");
  for (const table of TABLES)
    for (const row of data[table] ?? []) {
      if (row.owner_id !== owner)
        throw new Error("Respuesta de cuenta inesperada.");
      if (!dirty.has(table + ":" + row.id))
        await tx.store.put({
          key: [owner, table, row.id].join(":"),
          owner_id: owner,
          table,
          row,
        });
    }
  await tx.done;
}
export async function resolveOperation(
  op: Operation,
  choice: "cloud" | "local",
  remoteRows: Conflict[],
) {
  const db = await database(),
    all = await pending(op.owner_id);
  if (
    all.some(
      (o) =>
        o.id !== op.id &&
        o.changes.some((c) =>
          op.changes.some((x) => x.table === c.table && x.row.id === c.row.id),
        ),
    )
  )
    throw new Error(
      "Hay cambios posteriores sobre estos registros. Exporta una copia y resuelve los cambios más recientes antes de descartar el lote.",
    );
  const tx = db.transaction(["records", "outbox"], "readwrite");
  await tx.objectStore("outbox").delete(op.id);
  for (const c of op.changes) {
    const remote = remoteRows.find(
      (r) => r.id === c.row.id && r.table === c.table,
    );
    if (!remote) throw new Error("Falta la versión de la nube.");
    const key = [op.owner_id, c.table, c.row.id].join(":");
    if (choice === "cloud") {
      if (remote.remote)
        await tx
          .objectStore("records")
          .put({
            key,
            owner_id: op.owner_id,
            table: c.table,
            row: remote.remote,
          });
      else await tx.objectStore("records").delete(key);
    }
  }
  if (choice === "local") {
    const rebased = {
      ...op,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      attempts: 0,
      next_attempt: 0,
      error: null,
      conflicts: undefined,
      changes: op.changes.map((c) => ({
        ...c,
        expected_version: remoteRows.find(
          (r) => r.id === c.row.id && r.table === c.table,
        )!.actual,
      })),
    };
    for (const c of rebased.changes)
      await tx
        .objectStore("records")
        .put({
          key: [op.owner_id, c.table, c.row.id].join(":"),
          owner_id: op.owner_id,
          table: c.table,
          row: { ...c.row, version: c.expected_version + 1 },
        });
    await tx.objectStore("outbox").put(rebased);
  }
  await tx.done;
}
export async function readTimer(owner: string): Promise<Timer | null> {
  const db = await database();
  return (await db.get("timers", owner)) ?? null;
}
export async function writeTimer(owner: string, timer: Timer | null) {
  const db = await database();
  if (timer) await db.put("timers", timer, owner);
  else await db.delete("timers", owner);
}
