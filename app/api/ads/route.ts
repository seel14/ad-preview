import { NextResponse } from "next/server";

const BASE = "https://graph.facebook.com/v21.0";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const adId = searchParams.get("adId");
  const token = searchParams.get("token");

  if (!adId || !token) return NextResponse.json({ error: "adId and token required" }, { status: 400 });

  const [adRes, previewRes] = await Promise.all([
    fetch(`${BASE}/${adId}?fields=id,name,status,campaign_id,adset_id,creative{id,name,title,body,image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec,call_to_action_type}&access_token=${token}`),
    fetch(`${BASE}/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&height=700&access_token=${token}`),
  ]);

  const ad = await adRes.json();
  const preview = await previewRes.json();

  if (ad.error) return NextResponse.json({ error: ad.error.message }, { status: 400 });

  // get campaign and adset names
  const [campaignRes, adsetRes] = await Promise.all([
    ad.campaign_id ? fetch(`${BASE}/${ad.campaign_id}?fields=name&access_token=${token}`) : null,
    ad.adset_id ? fetch(`${BASE}/${ad.adset_id}?fields=name&access_token=${token}`) : null,
  ]);

  const campaign = campaignRes ? await campaignRes.json() : null;
  const adset = adsetRes ? await adsetRes.json() : null;

  return NextResponse.json({
    id: ad.id,
    name: ad.name,
    status: ad.status,
    campaign: campaign?.name ?? "",
    adset: adset?.name ?? "",
    creative: ad.creative ?? {},
    previewHtml: preview.data?.[0]?.body ?? null,
  });
}
