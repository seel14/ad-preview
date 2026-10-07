import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { encryptToken, listConnections, ownerKey, saveConnections, toPublic, verifyFbToken, type Connection } from "@/lib/connections";

export async function GET() {
  const owner = await ownerKey();
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json((await listConnections(owner)).map(toPublic));
}

// POST { name, token } — verifies the token with Facebook, then stores it encrypted
export async function POST(req: Request) {
  const owner = await ownerKey();
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!name || !token) return NextResponse.json({ error: "ต้องใส่ชื่อและ Token" }, { status: 400 });

  try {
    const identity = await verifyFbToken(token);
    const now = Date.now();
    const conn: Connection = { id: Math.random().toString(36).slice(2, 10) + now.toString(36), name, tokenEnc: encryptToken(token), last4: token.slice(-4), identity, createdAt: now, updatedAt: now };
    const list = await listConnections(owner);
    await saveConnections(owner, [...list, conn]);
    return NextResponse.json(toPublic(conn));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg === "no_encryption_secret" ? "เซิร์ฟเวอร์ยังไม่ได้ตั้งค่ากุญแจเข้ารหัส (AUTH_SECRET หรือ CONNECTIONS_KEY)" : `Token ใช้ไม่ได้: ${msg}` }, { status: 400 });
  }
}
