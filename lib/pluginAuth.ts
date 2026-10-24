import { timingSafeEqual } from "crypto";

// Read-only access for the weekly-report plugin (no browser session).
// Both env vars are required: PLUGIN_API_KEY (Bearer secret) and PLUGIN_OWNER_EMAIL
// (the Google email whose Projects the key may read — same value as session.user.partitionKey).
export type PluginAuth = { ok: true; owner: string } | { ok: false; status: number; error: string };

export function authorizePlugin(req: Request): PluginAuth {
  const key = process.env.PLUGIN_API_KEY;
  const owner = process.env.PLUGIN_OWNER_EMAIL;
  if (!key || key.length < 24 || !owner) return { ok: false, status: 503, error: "plugin_api_not_configured" };

  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, error: "unauthorized" };
  return { ok: true, owner };
}
