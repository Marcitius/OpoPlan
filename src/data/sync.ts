import type { Client } from "./client";
import type { DataSet, Conflict, Operation } from "../core/types";
import { TABLES, emptyData } from "../core/types";
import {
  pending,
  saveOperation,
  acknowledge,
  mergeCloud,
  readData,
  resolveOperation,
} from "./local";
export type SyncState = {
  status: "loading" | "synced" | "pending" | "offline" | "error" | "conflict";
  count: number;
  error: string | null;
  operations: Operation[];
};
export interface Remote {
  apply(op: Operation): Promise<{ ok?: boolean; conflicts?: Conflict[] }>;
  pull(owner: string): Promise<DataSet>;
}
export function supabaseRemote(client: Client): Remote {
  return {
    async apply(op) {
      const { data, error } = await client.rpc("apply_operations", {
        operation_id: op.id,
        changes: op.changes,
      });
      if (error) throw new Error(error.message);
      if (!data?.ok && !data?.conflicts)
        throw new Error("La nube no confirmó el guardado.");
      return data;
    },
    async pull(owner) {
      const d = emptyData();
      await Promise.all(
        TABLES.map(async (table) => {
          for (let offset = 0; ; offset += 1000) {
            const { data, error } = await client
              .from(table)
              .select("*")
              .eq("owner_id", owner)
              .order("id")
              .range(offset, offset + 999);
            if (error) throw new Error(error.message);
            (d[table] as unknown[]).push(...data);
            if (data.length < 1000) break;
          }
        }),
      );
      return d;
    },
  };
}
export class SyncEngine {
  private busy = false;
  private stopped = false;
  private requested = false;
  constructor(
    private owner: string,
    private remote: Remote,
    private onUpdate: (data: DataSet, state: SyncState) => void,
    private online = () => navigator.onLine,
  ) {}
  stop() {
    this.stopped = true;
  }
  async refresh(status?: SyncState["status"], error: string | null = null) {
    if (this.stopped) return;
    const ops = await pending(this.owner);
    this.onUpdate(await readData(this.owner), {
      status:
        status ??
        (!this.online() ? "offline" : ops.length ? "pending" : "synced"),
      count: ops.length,
      error,
      operations: ops,
    });
  }
  async sync(force = false) {
    if (this.busy) {
      this.requested = true;
      return;
    }
    if (this.stopped) return;
    this.busy = true;
    try {
      if (!this.online()) {
        await this.refresh("offline");
        return;
      }
      const ops = await pending(this.owner);
      for (const op of ops) {
        if (this.stopped) return;
        if (op.conflicts) {
          await this.refresh("conflict", op.error);
          return;
        }
        if (!force && op.next_attempt > Date.now()) {
          await this.refresh("error", op.error);
          return;
        }
        try {
          const r = await this.remote.apply(op);
          if (this.stopped) return;
          if (r.conflicts?.length) {
            await saveOperation({
              ...op,
              conflicts: r.conflicts,
              error: "Otro dispositivo ha cambiado estos datos.",
            });
            await this.refresh(
              "conflict",
              "Revisa el conflicto antes de sincronizar.",
            );
            return;
          }
          await acknowledge(op.id);
        } catch (e) {
          const message =
            e instanceof Error ? e.message : "No se pudo conectar.";
          await saveOperation({
            ...op,
            attempts: op.attempts + 1,
            next_attempt:
              Date.now() +
              Math.min(60000, 1000 * 2 ** Math.min(op.attempts, 6)),
            error: message,
          });
          await this.refresh("error", message);
          return;
        }
      }
      const cloud = await this.remote.pull(this.owner);
      if (this.stopped) return;
      await mergeCloud(this.owner, cloud);
      await this.refresh();
    } catch (e) {
      await this.refresh(
        "error",
        e instanceof Error ? e.message : "Error de sincronización.",
      );
    } finally {
      this.busy = false;
      if (this.requested && !this.stopped) {
        this.requested = false;
        void this.sync(force);
      }
    }
  }
  async resolve(op: Operation, choice: "cloud" | "local") {
    const cloud = await this.remote.pull(this.owner);
    const remote = op.changes.map((c) => {
      const row = cloud[c.table].find((r) => r.id === c.row.id);
      return {
        table: c.table,
        id: c.row.id,
        expected: c.expected_version,
        actual: row?.version ?? 0,
        remote: (row ?? null) as unknown as Conflict["remote"],
      };
    });
    await resolveOperation(op, choice, remote);
    await this.refresh();
    await this.sync(true);
  }
}
