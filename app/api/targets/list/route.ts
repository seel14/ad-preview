import { NextResponse } from "next/server";
import { resolveToken } from "@/lib/connections";
import { FacebookApiError } from "@/lib/facebook";
import { listAdsetsForAccount, listAdsetsForAds } from "@/lib/targets";

// POST { source: "loaded", token, adIds } | { source: "account", accountId }  → Ad Sets to pick from
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : null;
    if (body?.source === "account") {
      const token = await resolveToken(connectionId ? { connectionId } : { useStored: true }).catch(() => "");
      if (!token) return NextResponse.json({ error: "ยังไม่ได้เชื่อมต่อ Facebook หรือเลือก Connection" }, { status: 401 });
      if (typeof body.accountId !== "string" || !body.accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
      return NextResponse.json(await listAdsetsForAccount(body.accountId, token));
    }
    const token = await resolveToken({ token: body?.token, connectionId }).catch(() => "");
    const adIds: string[] = Array.isArray(body?.adIds) ? body.adIds.filter((x: unknown) => typeof x === "string" && /^\d+$/.test(x)) : [];
    if (!token || !adIds.length) return NextResponse.json({ error: "token and adIds required" }, { status: 400 });
    return NextResponse.json(await listAdsetsForAds(adIds, token));
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
