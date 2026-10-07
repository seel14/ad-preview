import { NextResponse } from "next/server";
import { FacebookApiError } from "@/lib/facebook";
import { getAdsetTargets } from "@/lib/targets";
import { resolveToken } from "@/lib/connections";

export const maxDuration = 60;

// POST { adsetIds, adIdsByAdset?, token? | useStored? } — targeting of the chosen Ad Sets
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const adsetIds: string[] = Array.isArray(body?.adsetIds) ? body.adsetIds.filter((x: unknown) => typeof x === "string" && /^\d+$/.test(x)) : [];
  if (!adsetIds.length) return NextResponse.json({ error: "adsetIds required" }, { status: 400 });

  let token = "";
  try {
    token = await resolveToken({ token: body?.token, connectionId: typeof body?.connectionId === "string" ? body.connectionId : null, useStored: !!body?.useStored });
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  try {
    return NextResponse.json(await getAdsetTargets(adsetIds, token, body?.adIdsByAdset ?? {}));
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
