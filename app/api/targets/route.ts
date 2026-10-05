import { NextResponse } from "next/server";
import { FacebookApiError } from "@/lib/facebook";
import { getAdsetTargets } from "@/lib/targets";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const adIds: string[] = Array.isArray(body?.adIds) ? body.adIds.filter((x: unknown) => typeof x === "string" && /^\d+$/.test(x)) : [];
  if (!token || !adIds.length) return NextResponse.json({ error: "token and adIds required" }, { status: 400 });

  try {
    return NextResponse.json(await getAdsetTargets(adIds, token));
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
