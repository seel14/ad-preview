import { NextResponse } from "next/server";
import { FacebookApiError } from "@/lib/facebook";
import { getCampaignStructure, listCampaigns } from "@/lib/fbStructure";
import { resolveToken } from "@/lib/connections";

export const maxDuration = 60;

// POST { action: "campaigns" | "structure", accountId, campaignIds?, connectionId? }
// Uses a saved Connection, or the Facebook OAuth login when no connectionId is given.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const connectionId = typeof body?.connectionId === "string" && body.connectionId ? body.connectionId : null;
  const token = await resolveToken(connectionId ? { connectionId } : { useStored: true }).catch(() => "");
  if (!token) return NextResponse.json({ error: "ยังไม่ได้เชื่อมต่อ Facebook หรือเลือก Connection" }, { status: 401 });

  try {
    if (body?.action === "structure") {
      const ids: string[] = Array.isArray(body.campaignIds) ? body.campaignIds.filter((x: unknown) => typeof x === "string") : [];
      return NextResponse.json(await getCampaignStructure(accountId, ids, token, !!body.includeInactive));
    }
    return NextResponse.json(await listCampaigns(accountId, token));
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
