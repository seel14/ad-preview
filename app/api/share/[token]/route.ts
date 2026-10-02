import { NextResponse } from "next/server";
import { getShare, saveShare, diffStructure, diffAdEdits, type AdEdits } from "@/lib/share";
import type { StructureNode } from "@/lib/redis";

// Public endpoints (no login) — the unguessable token is the credential.
// Never returns the owner's Facebook token or anything beyond the snapshot.

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await getShare(token);
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    projectName: rec.projectName,
    scope: rec.scope,
    status: rec.status,
    clientName: rec.clientName ?? "",
    ads: rec.base.ads,
    structure: rec.draft?.structure ?? rec.base.structure,
    adEdits: rec.draft?.adEdits ?? rec.base.adEdits,
    baseAdEdits: rec.base.adEdits,
  });
}

function isNodeArray(v: unknown): v is StructureNode[] {
  return Array.isArray(v);
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rec = await getShare(token);
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const raw = await req.text();
  if (raw.length > 2_000_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: { structure?: unknown; adEdits?: unknown; clientName?: unknown };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }

  const structure = rec.scope !== "preview" && isNodeArray(body.structure) ? body.structure : (rec.draft?.structure ?? rec.base.structure);
  const adEdits: AdEdits = rec.scope !== "structure" && body.adEdits && typeof body.adEdits === "object"
    ? sanitizeEdits(body.adEdits as Record<string, unknown>)
    : (rec.draft?.adEdits ?? rec.base.adEdits);

  const changes = [
    ...diffStructure(rec.base.structure, structure),
    ...diffAdEdits(rec.base.ads, rec.base.adEdits, adEdits),
  ];

  rec.draft = { structure, adEdits };
  rec.changes = changes;
  rec.status = changes.length ? "pending" : "idle";
  rec.clientName = typeof body.clientName === "string" ? body.clientName.slice(0, 80) : rec.clientName;
  rec.updatedAt = Date.now();
  await saveShare(rec);
  return NextResponse.json({ ok: true, changeCount: changes.length });
}

function sanitizeEdits(input: Record<string, unknown>): AdEdits {
  const out: AdEdits = {};
  for (const [id, v] of Object.entries(input)) {
    if (!v || typeof v !== "object") continue;
    const e = v as Record<string, unknown>;
    const edit: AdEdits[string] = {};
    for (const k of ["body", "headline", "description"] as const) {
      if (typeof e[k] === "string") edit[k] = (e[k] as string).slice(0, 5000);
    }
    if (Object.keys(edit).length) out[id] = edit;
  }
  return out;
}
