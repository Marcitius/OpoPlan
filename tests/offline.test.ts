import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  enqueue,
  pending,
  readData,
  writeTimer,
  readTimer,
} from "../src/data/local";
import { SyncEngine } from "../src/data/sync";
import type { Remote, SyncState } from "../src/data/sync";
import { emptyData, base } from "../src/core/types";
import type { Operation, DataSet, TableName } from "../src/core/types";
import { opp, ch, node } from "./helpers";
function backend() {
  const d = emptyData(),
    ids = new Set<string>();
  let lost = false;
  return {
    d,
    ids,
    setLost: () => {
      lost = true;
    },
    remote: {
      async apply(op: Operation) {
        if (!ids.has(op.id)) {
          const conflicts = op.changes.flatMap((c) => {
            const row = d[c.table].find((r) => r.id === c.row.id);
            return (row?.version ?? 0) !== c.expected_version
              ? [
                  {
                    table: c.table,
                    id: c.row.id,
                    expected: c.expected_version,
                    actual: row?.version ?? 0,
                    remote: (row as any) ?? null,
                  },
                ]
              : [];
          });
          if (conflicts.length) return { conflicts };
          for (const c of op.changes) {
            const rows = d[c.table] as any[];
            const i = rows.findIndex((r) => r.id === c.row.id);
            const row = { ...c.row, version: c.expected_version + 1 };
            if (i >= 0) rows[i] = row;
            else rows.push(row);
          }
          ids.add(op.id);
        }
        if (lost) {
          lost = false;
          throw new Error("Response lost after commit");
        }
        return { ok: true };
      },
      async pull(owner: string) {
        const result = emptyData();
        for (const table of Object.keys(d) as TableName[])
          (result[table] as any[]).push(
            ...d[table].filter((r) => r.owner_id === owner),
          );
        return result;
      },
    } satisfies Remote,
  };
}
describe("IndexedDB and synchronization persistence", () => {
  it("queues offline, survives reopening, synchronizes once and appears in cloud readback", async () => {
    const owner = crypto.randomUUID(),
      o = opp(owner),
      b = backend();
    await enqueue(owner, [ch("oppositions", o)]);
    expect((await readData(owner)).oppositions).toHaveLength(1);
    let online = false,
      state: SyncState | undefined;
    const engine = new SyncEngine(
      owner,
      b.remote,
      (_, s) => {
        state = s;
      },
      () => online,
    );
    await engine.sync();
    expect(state!.status).toBe("offline");
    engine.stop();
    online = true;
    const reopened = new SyncEngine(
      owner,
      b.remote,
      (_, s) => {
        state = s;
      },
      () => online,
    );
    await reopened.sync(true);
    await reopened.sync(true);
    expect(b.d.oppositions).toHaveLength(1);
    expect(await pending(owner)).toHaveLength(0);
    expect(state!.status).toBe("synced");
  });
  it("a lost response retries with the same operation ID, without duplicate activity", async () => {
    const owner = crypto.randomUUID(),
      b = backend(),
      o = opp(owner);
    await enqueue(owner, [ch("oppositions", o)]);
    b.setLost();
    let state: SyncState | undefined;
    const engine = new SyncEngine(
      owner,
      b.remote,
      (_, s) => {
        state = s;
      },
      () => true,
    );
    await engine.sync(true);
    expect(state!.status).toBe("error");
    expect(b.d.oppositions).toHaveLength(1);
    expect(await pending(owner)).toHaveLength(1);
    await engine.sync(true);
    expect(b.ids.size).toBe(1);
    expect(b.d.oppositions).toHaveLength(1);
    expect(await pending(owner)).toHaveLength(0);
  });
  it("rolls back every local row if one optimistic version fails", async () => {
    const owner = crypto.randomUUID(),
      o = opp(owner);
    await expect(
      enqueue(owner, [
        ch("oppositions", o),
        ch("nodes", node(owner, o.id), 99),
      ]),
    ).rejects.toThrow("cambiado");
    expect((await readData(owner)).oppositions).toHaveLength(0);
    expect(await pending(owner)).toHaveLength(0);
  });
  it("serial queue ordering keeps create-before-edit even at equal timestamps", async () => {
    const owner = crypto.randomUUID(),
      o = opp(owner),
      b = backend();
    const first = await enqueue(owner, [ch("oppositions", o)]);
    const local = (await readData(owner)).oppositions[0];
    const second = await enqueue(owner, [
      ch("oppositions", { ...local, name: "Edited" }),
    ]);
    expect(second.queue_order).toBe(first.queue_order! + 1);
    const engine = new SyncEngine(
      owner,
      b.remote,
      () => {},
      () => true,
    );
    await engine.sync(true);
    expect(b.d.oppositions[0].name).toBe("Edited");
    expect(await pending(owner)).toHaveLength(0);
  });
  it("detects conflicts instead of silently overwriting and can retain cloud version", async () => {
    const owner = crypto.randomUUID(),
      o = opp(owner),
      b = backend();
    b.d.oppositions = [{ ...o, version: 2, name: "Other device" }];
    await enqueue(owner, [ch("oppositions", { ...o, name: "Local edit" }, 0)]);
    let state: SyncState | undefined;
    const e = new SyncEngine(
      owner,
      b.remote,
      (_, s) => {
        state = s;
      },
      () => true,
    );
    await e.sync(true);
    expect(state!.status).toBe("conflict");
    expect((await readData(owner)).oppositions[0].name).toBe("Local edit");
    await e.resolve((await pending(owner))[0], "cloud");
    expect((await readData(owner)).oppositions[0].name).toBe("Other device");
    expect(await pending(owner)).toHaveLength(0);
  });
  it("separates different users and persists timer timestamps", async () => {
    const owner = crypto.randomUUID(),
      other = crypto.randomUUID(),
      o = opp(owner);
    await enqueue(owner, [ch("oppositions", o)]);
    expect((await readData(other)).oppositions).toHaveLength(0);
    const t = {
      id: crypto.randomUUID(),
      owner_id: owner,
      kind: "study" as const,
      nodeIds: [],
      taskId: null,
      startedAt: new Date().toISOString(),
      runningSince: Date.now(),
      accumulated: 15,
      mode: "continuous" as const,
      phase: "work" as const,
      phaseAccumulated: 0,
      workSeconds: 1500,
      breakSeconds: 300,
    };
    await writeTimer(owner, t);
    expect(await readTimer(other)).toBeNull();
    expect(await readTimer(owner)).toEqual(t);
  });
});
