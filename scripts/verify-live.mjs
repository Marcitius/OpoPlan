// Opt-in verification against a real Supabase project, using two dedicated users.
// Never uses service_role and never deletes an account.
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const required = [
  "TEST_SUPABASE_URL",
  "TEST_SUPABASE_PUBLIC_KEY",
  "TEST_EMAIL_A",
  "TEST_PASSWORD_A",
  "TEST_EMAIL_B",
  "TEST_PASSWORD_B",
];
for (const key of required)
  if (!process.env[key])
    throw new Error("Missing " + key + " in local .env.live");
const url = process.env.TEST_SUPABASE_URL,
  key = process.env.TEST_SUPABASE_PUBLIC_KEY;
if (
  !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) ||
  key.startsWith("sb_secret_")
)
  throw new Error("Use a Supabase project URL and its public key.");
if (!key.startsWith("sb_publishable_")) {
  try {
    const claims = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (claims.role !== "anon") throw new Error();
  } catch {
    throw new Error("Only public publishable/anon keys are allowed.");
  }
}
const client = () =>
  createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
const a = client(),
  b = client(),
  second = client();
const login = async (c, which) => {
  const { data, error } = await c.auth.signInWithPassword({
    email: process.env["TEST_EMAIL_" + which],
    password: process.env["TEST_PASSWORD_" + which],
  });
  if (error)
    throw new Error(
      "Authentication failed for dedicated test account " + which,
    );
  return data.user.id;
};
const A = await login(a, "A"),
  B = await login(b, "B");
assert.notEqual(A, B, "Use two distinct accounts");
const base = (owner) => ({
  id: crypto.randomUUID(),
  owner_id: owner,
  version: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
});
const opp = (owner) => ({
  ...base(owner),
  name: "Verificación OpoPlan " + new Date().toISOString(),
  exam_date: null,
  archived: false,
});
const node = (owner, opposition) => ({
  ...base(owner),
  opposition_id: opposition,
  parent_id: null,
  source_node_id: null,
  name: "Bloque de verificación",
  kind: "block",
  position: 0,
  archived: false,
  importance: 3,
  estimated_minutes: 10,
  notes: "",
});
const change = (table, row, version = 0) => ({
  table,
  row,
  expected_version: version,
});
const apply = async (c, changes, operation = crypto.randomUUID()) => {
  const { data, error } = await c.rpc("apply_operations", {
    operation_id: operation,
    changes,
  });
  if (error) throw error;
  return data;
};
const oa = opp(A),
  ob = opp(B),
  na = node(A, oa.id);
let createdA = false,
  createdB = false;
try {
  const changes = [change("oppositions", oa), change("nodes", na)],
    id = crypto.randomUUID();
  assert.equal((await apply(a, changes, id)).ok, true);
  createdA = true;
  assert.equal((await apply(a, changes, id)).ok, true);
  assert.equal((await apply(b, [change("oppositions", ob)])).ok, true);
  createdB = true;
  const hidden = await b
    .from("nodes")
    .select("id")
    .eq("owner_id", A)
    .eq("id", na.id);
  assert.ifError(hidden.error);
  assert.equal(hidden.data.length, 0);
  await assert.rejects(() =>
    apply(b, [change("nodes", { ...node(B, ob.id), owner_id: A })]),
  );
  await assert.rejects(() =>
    apply(b, [change("nodes", { ...node(B, ob.id), parent_id: na.id })]),
  );
  assert.equal(
    (
      await apply(a, [
        change("oppositions", { ...oa, name: "Conflicto de prueba" }, 0),
      ])
    ).conflicts.length,
    1,
  );
  await login(second, "A");
  const read = await second
    .from("nodes")
    .select("id")
    .eq("owner_id", A)
    .eq("id", na.id);
  assert.ifError(read.error);
  assert.equal(read.data.length, 1);
  console.log(
    "PASS: two authenticated users isolated; cross-owner requests rejected; retry idempotent; stale version conflict; second authenticated session reads persisted data.",
  );
} finally {
  if (createdA)
    await apply(a, [change("oppositions", { ...oa, archived: true }, 1)]).catch(
      () =>
        console.warn(
          "Archive test opposition A manually if it remains visible.",
        ),
    );
  if (createdB)
    await apply(b, [change("oppositions", { ...ob, archived: true }, 1)]).catch(
      () =>
        console.warn(
          "Archive test opposition B manually if it remains visible.",
        ),
    );
  await Promise.all([
    a.auth.signOut(),
    b.auth.signOut(),
    second.auth.signOut(),
  ]);
}
