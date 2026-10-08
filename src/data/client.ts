import { createClient } from "@supabase/supabase-js";
export interface Connection {
  url: string;
  key: string;
}
export function connection(): Connection | null {
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url =
    import.meta.env.VITE_SUPABASE_URL ??
    "https://kavehkjbwyycthpfsngz.supabase.co";
  if (key) return { url, key };
  try {
    return JSON.parse(localStorage.getItem("opoplan-connection") ?? "null");
  } catch {
    return null;
  }
}
export function validateConnection(c: Connection) {
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(c.url))
    throw new Error("Utiliza la URL HTTPS de tu proyecto Supabase.");
  if (c.key.startsWith("sb_secret_"))
    throw new Error(
      "Esta es una clave secreta. Utiliza solo la publishable key.",
    );
  if (c.key.startsWith("eyJ")) {
    try {
      const role = JSON.parse(
        atob(c.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).role;
      if (role !== "anon") throw new Error();
    } catch {
      throw new Error("Solo se admite una clave pública anon o publishable.");
    }
  } else if (!c.key.startsWith("sb_publishable_"))
    throw new Error("Introduce una publishable key pública válida.");
}
export function makeClient(c: Connection) {
  validateConnection(c);
  return createClient(c.url, c.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "opoplan-auth-" + new URL(c.url).hostname,
    },
  });
}
export type Client = ReturnType<typeof makeClient>;
