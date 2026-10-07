import crypto from "crypto";
import { auth } from "@/auth";
import { redis } from "@/lib/redis";

// Facebook access tokens (e.g. a System User token) saved once per user and referenced by projects.
// The token is encrypted at rest and never sent back to the browser.

export interface Connection {
  id: string;
  name: string;
  tokenEnc: string;
  last4: string;
  identity: string; // who the token belongs to, as reported by Facebook (/me)
  createdAt: number;
  updatedAt: number;
}

export interface ConnectionPublic { id: string; name: string; last4: string; identity: string; createdAt: number; updatedAt: number }

const keyFor = (owner: string) => `connections:${owner}`;

function secretKey(): Buffer {
  const secret = process.env.CONNECTIONS_KEY ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("no_encryption_secret");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptToken(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export const toPublic = (c: Connection): ConnectionPublic => ({ id: c.id, name: c.name, last4: c.last4, identity: c.identity, createdAt: c.createdAt, updatedAt: c.updatedAt });

export async function ownerKey(): Promise<string | null> {
  const session = await auth();
  return session?.user?.partitionKey || null;
}

export async function listConnections(owner: string): Promise<Connection[]> {
  if (!redis) return [];
  return (await redis.get<Connection[]>(keyFor(owner))) ?? [];
}

export async function saveConnections(owner: string, list: Connection[]) {
  if (!redis) throw new Error("Redis not configured");
  await redis.set(keyFor(owner), list);
}

// Checks the token with Facebook and returns who it belongs to.
export async function verifyFbToken(token: string): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error.message ?? "invalid_token");
  return `${data.name ?? "?"} (${data.id})`;
}

// Resolves the Facebook token for a request: a saved Connection (signed-in owner only), the OAuth token, or a pasted token.
export async function resolveToken(opts: { token?: string | null; connectionId?: string | null; useStored?: boolean }): Promise<string> {
  if (opts.connectionId) {
    const owner = await ownerKey();
    if (!owner) throw new Error("unauthorized");
    const conn = (await listConnections(owner)).find(c => c.id === opts.connectionId);
    if (!conn) throw new Error("connection_not_found");
    return decryptToken(conn.tokenEnc);
  }
  if (opts.useStored) {
    const owner = await ownerKey();
    if (!owner || !redis) throw new Error("unauthorized");
    return (await redis.get<string>(`fb_token:${owner}`)) ?? "";
  }
  return (opts.token ?? "").trim();
}
