import { fetchAllPages } from "@/lib/graphPaging";

const BASE = "https://graph.facebook.com/v21.0";

// The one error type every verb in this module throws for a Graph API failure.
// Route handlers catch this once, at the boundary, instead of hand-checking
// `.error` on a raw Graph JSON response.
export class FacebookApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "FacebookApiError";
    this.code = code;
  }
}

interface GraphError { error?: { message?: string; code?: string } }

async function graphFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json()) as T & GraphError;
  if (data?.error) throw new FacebookApiError(data.error.message ?? "graph_api_error", data.error.code);
  return data;
}

async function graphFetchAllPages<T>(url: string): Promise<T[]> {
  try {
    return await fetchAllPages<T>(url);
  } catch (e) {
    throw new FacebookApiError(e instanceof Error ? e.message : "graph_api_error");
  }
}

export interface AdAccount {
  id: string;
  name: string;
  account_id: string;
  account_status: number;
  currency: string;
}

export interface FbAd {
  id: string;
  name: string;
  status: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: { thumbnail_url?: string; image_url?: string };
}

export interface FbCampaign {
  id: string;
  name: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CreativeShape = any; // matches Graph's ad.creative shape as consumed by SlideView/AdsStructure

export interface AdPreview {
  id: string;
  name: string;
  status: string;
  campaign: string;
  adset: string;
  creative: CreativeShape;
  albumImages: string[];
  previewHtml: string | null;
  page: { name: string; picture: string } | null;
}

// ── OAuth ────────────────────────────────────────────────────────────────

// Code → short-lived → long-lived (60-day) access token, in one call.
export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<{ accessToken: string }> {
  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;

  const tokenData = await graphFetch<{ access_token?: string }>(
    `${BASE}/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
  );
  if (!tokenData.access_token) throw new FacebookApiError("token_exchange_failed");

  const longData = await graphFetch<{ access_token?: string }>(
    `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
  );

  return { accessToken: longData.access_token ?? tokenData.access_token };
}

// ── Ad accounts / ads / campaigns ───────────────────────────────────────

export async function getAdAccounts(token: string): Promise<AdAccount[]> {
  return graphFetchAllPages<AdAccount>(
    `${BASE}/me/adaccounts?fields=id,name,account_id,account_status,currency&limit=100&access_token=${token}`
  );
}

export async function getAds(
  accountId: string,
  token: string,
  filters?: { campaignId?: string; status?: string }
): Promise<{ ads: FbAd[]; campaigns: FbCampaign[] }> {
  const fields = "id,name,status,campaign_id,adset_id,creative{thumbnail_url,image_url}";
  const params = new URLSearchParams({ fields, limit: "100", access_token: token });
  if (filters?.status) params.set("effective_status", `["${filters.status}"]`);

  const adsUrl = `${BASE}/${accountId}/ads?${params.toString()}`;
  const campaignsUrl = `${BASE}/${accountId}/campaigns?fields=id,name&limit=100&access_token=${token}`;

  const [allAds, campaigns] = await Promise.all([
    graphFetchAllPages<FbAd>(adsUrl),
    graphFetchAllPages<FbCampaign>(campaignsUrl),
  ]);

  const ads = filters?.campaignId ? allAds.filter(a => a.campaign_id === filters.campaignId) : allAds;
  return { ads, campaigns };
}

// ── Single-ad preview bundle ─────────────────────────────────────────────

// Composite verb: everything SlideView needs for one ad, in one call. Hides the
// underlying multi-round-trip fetch chain (ad+preview → maybe creative → maybe
// post-attachments for the album-image fallback → campaign/adset/page names).
export async function getAdPreview(adId: string, token: string): Promise<AdPreview> {
  const [ad, preview] = await Promise.all([
    graphFetch<CreativeShape>(
      `${BASE}/${adId}?fields=id,name,status,campaign_id,adset_id,creative.thumbnail_width(1080).thumbnail_height(1080){id,name,title,body,image_url,thumbnail_url,video_id,effective_object_story_id,object_story_spec{link_data{message,name,description,picture,link,child_attachments{picture,link,name,description}},video_data{message,title,image_url},page_id},asset_feed_spec,call_to_action_type}&access_token=${token}`
    ),
    graphFetch<{ data?: { body?: string }[] }>(
      `${BASE}/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&height=700&access_token=${token}`
    ),
  ]);

  let creative = ad.creative ?? {};

  // If nested object_story_spec is missing, fetch the creative object directly
  if (!creative.object_story_spec && creative.id) {
    try {
      const creativeData = await graphFetch<CreativeShape>(
        `${BASE}/${creative.id}?fields=effective_object_story_id,object_story_spec{link_data{message,name,description,picture,link,child_attachments{picture,link,name,description}},video_data{message,title,image_url},page_id},asset_feed_spec,image_url,thumbnail_url&thumbnail_width=1080&thumbnail_height=1080&access_token=${token}`
      );
      creative = { ...creative, ...creativeData };
    } catch {
      // fall back to whatever creative fields we already have
    }
  }

  // Normalize child_attachments: may be { data: [...] } or plain array
  if (creative.object_story_spec?.link_data?.child_attachments) {
    const ca = creative.object_story_spec.link_data.child_attachments;
    creative.object_story_spec.link_data.child_attachments = Array.isArray(ca) ? ca : (ca.data ?? []);
  }

  // For boosted album posts: fetch post attachments using pages_read_engagement.
  // Failures here are an internal fallback, not a caller-visible error.
  let albumImages: string[] = [];
  const hasChildAttachments = !!creative.object_story_spec?.link_data?.child_attachments?.length;
  if (!hasChildAttachments) {
    const effectiveStoryId = creative.effective_object_story_id as string | undefined;
    if (effectiveStoryId) {
      try {
        const attachData = await graphFetch<CreativeShape>(
          `${BASE}/${effectiveStoryId}?fields=attachments{media{image{src}},subattachments{data{media{image{src}}}}}&access_token=${token}`
        );
        const attachments = attachData.attachments?.data ?? [];
        for (const att of attachments) {
          if (att.media?.image?.src) albumImages.push(att.media.image.src);
          const subs = att.subattachments?.data ?? [];
          for (const sub of subs) {
            if (sub.media?.image?.src) albumImages.push(sub.media.image.src);
          }
        }
        albumImages = [...new Set(albumImages)].slice(0, 8);
      } catch {
        // no album fallback available — leave albumImages empty
      }
    }
  }

  const effectiveStoryId = creative.effective_object_story_id as string | undefined;
  const pageId = creative.object_story_spec?.page_id ?? effectiveStoryId?.split("_")[0];

  const [campaign, adset, page] = await Promise.all([
    ad.campaign_id ? graphFetch<{ name?: string }>(`${BASE}/${ad.campaign_id}?fields=name&access_token=${token}`).catch(() => null) : null,
    ad.adset_id ? graphFetch<{ name?: string }>(`${BASE}/${ad.adset_id}?fields=name&access_token=${token}`).catch(() => null) : null,
    pageId ? graphFetch<{ name?: string; picture?: { data?: { url?: string } } }>(`${BASE}/${pageId}?fields=name,picture{url}&access_token=${token}`).catch(() => null) : null,
  ]);

  return {
    id: ad.id,
    name: ad.name,
    status: ad.status,
    campaign: campaign?.name ?? "",
    adset: adset?.name ?? "",
    creative,
    albumImages,
    previewHtml: preview.data?.[0]?.body ?? null,
    page: page ? { name: page.name ?? "", picture: page.picture?.data?.url ?? "" } : null,
  };
}
