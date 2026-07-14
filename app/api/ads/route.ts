import { NextResponse } from "next/server";
import { getAdPreview, FacebookApiError } from "@/lib/facebook";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const adId = searchParams.get("adId");
  const token = searchParams.get("token");

  if (!adId || !token) return NextResponse.json({ error: "adId and token required" }, { status: 400 });

  try {
    const adPreview = await getAdPreview(adId, token);
    return NextResponse.json(adPreview);
  } catch (e) {
    const message = e instanceof FacebookApiError ? e.message : "graph_api_error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
