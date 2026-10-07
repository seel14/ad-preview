import { NextResponse } from "next/server";
import { encryptToken, listConnections, ownerKey, saveConnections, toPublic, verifyFbToken } from "@/lib/connections";

// PUT { name?, token? } — rename and/or replace the token (verified first)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerKey();
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const list = await listConnections(owner);
  const idx = list.findIndex(c => c.id === id);
  if (idx < 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const next = { ...list[idx] };
  if (typeof body?.name === "string" && body.name.trim()) next.name = body.name.trim();
  if (typeof body?.token === "string" && body.token.trim()) {
    const token = body.token.trim();
    try {
      next.identity = await verifyFbToken(token);
      next.tokenEnc = encryptToken(token);
      next.last4 = token.slice(-4);
    } catch (e) {
      return NextResponse.json({ error: `Token ใช้ไม่ได้: ${e instanceof Error ? e.message : "error"}` }, { status: 400 });
    }
  }
  next.updatedAt = Date.now();
  list[idx] = next;
  await saveConnections(owner, list);
  return NextResponse.json(toPublic(next));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerKey();
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await saveConnections(owner, (await listConnections(owner)).filter(c => c.id !== id));
  return NextResponse.json({ ok: true });
}
