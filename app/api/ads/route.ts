import { NextResponse } from "next/server";
import { getAdPreview, FacebookApiError } from "@/lib/facebook";
import { resolveToken } from "@/lib/connections";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const adId = searchParams.get("adId");
  const connectionId = searchParams.get("connectionId");
  let token: string | null = searchParams.get("token");
  if (connectionId) {
    try { token = await resolveToken({ connectionId }); } catch { return NextResponse.json({ error: "ใช้ Connection ไม่ได้ (ยังไม่ได้ล็อกอินหรือถูกลบแล้ว)" }, { status: 401 }); }
  }

  if (!adId || !token) return NextResponse.json({ error: "adId and token required" }, { status: 400 });

  try {
    const adPreview = await getAdPreview(adId, token);
    return NextResponse.json(adPreview);
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
