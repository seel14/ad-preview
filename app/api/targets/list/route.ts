import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { redis } from "@/lib/redis";
import { FacebookApiError } from "@/lib/facebook";
import { listAdsetsForAccount, listAdsetsForAds } from "@/lib/targets";

// POST { source: "loaded", token, adIds } | { source: "account", accountId }  → Ad Sets to pick from
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    if (body?.source === "account") {
      const session = await auth();
      if (!session?.user?.partitionKey || !redis) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      const token = await redis.get<string>(`fb_token:${session.user.partitionKey}`);
      if (!token) return NextResponse.json({ error: "ยังไม่ได้เชื่อมต่อ Facebook" }, { status: 401 });
      if (typeof body.accountId !== "string" || !body.accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
      return NextResponse.json(await listAdsetsForAccount(body.accountId, token));
    }
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    const adIds: string[] = Array.isArray(body?.adIds) ? body.adIds.filter((x: unknown) => typeof x === "string" && /^\d+$/.test(x)) : [];
    if (!token || !adIds.length) return NextResponse.json({ error: "token and adIds required" }, { status: 400 });
    return NextResponse.json(await listAdsetsForAds(adIds, token));
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
