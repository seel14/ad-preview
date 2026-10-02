import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getShare, deleteShare, saveShare, acceptShare } from "@/lib/share";

async function owned(token: string) {
  const session = await auth();
  const owner = session?.user?.partitionKey;
  if (!owner) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const rec = await getShare(token);
  if (!rec || rec.ownerKey !== owner) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { rec };
}

// DELETE — revoke the link
export async function DELETE(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { rec, error } = await owned(token);
  if (error) return error;
  await deleteShare(rec!);
  return NextResponse.json({ ok: true });
}

// POST { action: "accept" | "dismiss" } — resolve the client's pending changes
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { rec, error } = await owned(token);
  if (error) return error;
  const { action } = await req.json().catch(() => ({}));

  if (action === "accept") {
    const ok = await acceptShare(rec!);
    return NextResponse.json({ ok, applied: ok });
  }
  if (action === "dismiss") {
    rec!.draft = undefined;
    rec!.changes = [];
    rec!.status = "idle";
    rec!.updatedAt = Date.now();
    await saveShare(rec!);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
