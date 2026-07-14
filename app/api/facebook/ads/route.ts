import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { redis } from "@/lib/redis";
import { getAds, FacebookApiError } from "@/lib/facebook";

// GET /api/facebook/ads?accountId=act_xxx&campaign=xxx&status=ACTIVE
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const token = await redis.get<string>(`fb_token:${session.user.partitionKey}`);
  if (!token) return NextResponse.json({ error: "not_connected" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId");
  const campaignId = searchParams.get("campaign") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  try {
    const { ads, campaigns } = await getAds(accountId, token, { campaignId, status });
    return NextResponse.json({ ads, campaigns });
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
