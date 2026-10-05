import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { redis } from "@/lib/redis";
import { FacebookApiError } from "@/lib/facebook";
import { getAdsetTargets } from "@/lib/targets";

export const maxDuration = 60;

// POST { adsetIds, adIdsByAdset?, token? | useStored? } — targeting of the chosen Ad Sets
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const adsetIds: string[] = Array.isArray(body?.adsetIds) ? body.adsetIds.filter((x: unknown) => typeof x === "string" && /^\d+$/.test(x)) : [];
  if (!adsetIds.length) return NextResponse.json({ error: "adsetIds required" }, { status: 400 });

  let token = typeof body?.token === "string" ? body.token.trim() : "";
  if (body?.useStored) {
    const session = await auth();
    if (!session?.user?.partitionKey || !redis) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    token = (await redis.get<string>(`fb_token:${session.user.partitionKey}`)) ?? "";
  }
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  try {
    return NextResponse.json(await getAdsetTargets(adsetIds, token, body?.adIdsByAdset ?? {}));
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
