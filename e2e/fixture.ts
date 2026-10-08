// Test-only Supabase HTTP adapter. Queries and RPCs execute the actual migrations
// in PostgreSQL/PGlite. Auth endpoints are simulated, never included in the PWA.
import type { BrowserContext } from "@playwright/test";
import type { PGlite } from "@electric-sql/pglite";
import { testDB, asUser, A, B } from "../tests/helpers";
import { TABLES } from "../src/core/types";
export const publicKey = "sb_publishable_fixture";
const makeUser = (id: string) => ({
  id,
  email: id === A ? "a@example.test" : "b@example.test",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
});
const token = (id: string) =>
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  ) +
  "." +
  Buffer.from(
    JSON.stringify({
      sub: id,
      role: "authenticated",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 7200,
      iat: Math.floor(Date.now() / 1000),
    }),
  ).toString("base64url") +
  ".test-signature";
const session = (id: string) => ({
  access_token: token(id),
  refresh_token: "refresh-" + id,
  expires_in: 7200,
  expires_at: Math.floor(Date.now() / 1000) + 7200,
  token_type: "bearer",
  user: makeUser(id),
});
export async function adapter() {
  const db = await testDB();
  let rpcCalls = 0;
  return {
    db,
    get rpcCalls() {
      return rpcCalls;
    },
    async attach(context: BrowserContext) {
      await context.routeWebSocket("**/realtime/**", (ws) => ws.close());
      await context.route("https://fixture.supabase.co/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        let owner = A;
        const bearer = req.headers()["authorization"]?.replace("Bearer ", "");
        if (bearer?.split(".").length === 3) {
          try {
            owner = JSON.parse(
              Buffer.from(bearer.split(".")[1], "base64url").toString(),
            ).sub;
          } catch {}
        }
        const respond = (body: any, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            headers: { "access-control-allow-origin": "*" },
            body: JSON.stringify(body),
          });
        if (req.method() === "OPTIONS") {
          await respond({});
          return;
        }
        try {
          if (url.pathname.startsWith("/auth/v1/")) {
            const body = req.postDataJSON() ?? {};
            if (url.pathname.endsWith("/token")) {
              if (url.searchParams.get("grant_type") === "refresh_token") {
                await respond(session(body.refresh_token.endsWith(B) ? B : A));
                return;
              }
              if (body.password !== "correct-password") {
                await respond(
                  {
                    error: "invalid_grant",
                    error_description: "Invalid login credentials",
                    msg: "Invalid login credentials",
                  },
                  400,
                );
                return;
              }
              await respond(session(body.email === "b@example.test" ? B : A));
              return;
            }
            if (url.pathname.endsWith("/signup")) {
              await respond(session(body.email === "b@example.test" ? B : A));
              return;
            }
            if (url.pathname.endsWith("/user")) {
              await respond(makeUser(owner));
              return;
            }
            await respond({});
            return;
          }
          if (url.pathname === "/rest/v1/rpc/apply_operations") {
            rpcCalls++;
            const body = req.postDataJSON(),
              result = await asUser<{ result: any }>(
                db,
                owner,
                "select public.apply_operations($1,$2::jsonb) result",
                [body.operation_id, JSON.stringify(body.changes)],
              );
            await respond(result.rows[0].result);
            return;
          }
          const table = url.pathname.split("/").pop()!;
          if (!TABLES.includes(table as any)) {
            await respond({ message: "Table not allowed" }, 400);
            return;
          }
          const requestedOwner =
            url.searchParams.get("owner_id")?.replace("eq.", "") ?? owner;
          const result = await asUser(
            db,
            owner,
            `select * from public.${table} where owner_id=$1 order by id limit 1000 offset $2`,
            [requestedOwner, Number(url.searchParams.get("offset") ?? 0)],
          );
          await respond(
            result.rows.map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key,
                  [
                    "exam_date",
                    "scheduled_day",
                    "original_day",
                    "study_day",
                    "manual_due",
                    "scheduled_due",
                    "day",
                    "last_sent_day",
                  ].includes(key) && value
                    ? new Date(value as string).toISOString().slice(0, 10)
                    : ["penalty", "score", "max_score"].includes(key)
                      ? Number(value)
                      : value,
                ]),
              ),
            ),
          );
        } catch (error) {
          await respond(
            { message: (error as Error).message, code: "TEST_DATABASE_ERROR" },
            400,
          );
        }
      });
    },
  };
}
export { A, B };
