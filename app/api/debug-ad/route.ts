import { NextResponse } from "next/server";

const BASE = "https://graph.facebook.com/v21.0";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const adId = searchParams.get("adId");
  const token = searchParams.get("token");
  if (!adId || !token) return NextResponse.json({ error: "adId and token required" }, { status: 400 });

  // Step 1: raw ad fetch
  const adRes = await fetch(
    `${BASE}/${adId}?fields=id,name,creative{id,effective_object_story_id,object_story_spec,asset_feed_spec,thumbnail_url}&access_token=${token}`
  );
  const adRaw = await adRes.json();

  const creativeId = adRaw.creative?.id;
  const storyId = adRaw.creative?.effective_object_story_id;

  // Step 2: direct creative fetch
  let creativeDirect = null;
  if (creativeId) {
    const r = await fetch(`${BASE}/${creativeId}?fields=effective_object_story_id,object_story_spec,asset_feed_spec,image_url,thumbnail_url&access_token=${token}`);
    creativeDirect = await r.json();
  }

  // Step 3: post attachments
  let postAttachments = null;
  const sid = storyId ?? creativeDirect?.effective_object_story_id;
  if (sid) {
    const r = await fetch(`${BASE}/${sid}?fields=attachments{media{image{src}},subattachments{data{media{image{src}}}}}&access_token=${token}`);
    postAttachments = await r.json();
  }

  // Step 4: preview HTML parsing (same logic as /api/ads)
  let previewHtmlDebug: { url?: string; status?: number; htmlLength?: number; albumImages?: string[]; error?: string } = {};
  const previewRes = await fetch(`https://graph.facebook.com/v21.0/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&height=700&access_token=${token}`);
  const preview = await previewRes.json();
  const previewBody = preview.data?.[0]?.body ?? "";
  const iframeSrcMatch = previewBody.match(/src="([^"]+)"/);
  if (iframeSrcMatch) {
    const previewUrl = iframeSrcMatch[1].replace(/&amp;/g, "&");
    previewHtmlDebug.url = previewUrl;
    try {
      const htmlRes = await fetch(previewUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AdPreviewBot/1.0)" } });
      previewHtmlDebug.status = htmlRes.status;
      const html = await htmlRes.text();
      previewHtmlDebug.htmlLength = html.length;
      const imgMatches = [...html.matchAll(/https:\/\/[a-z0-9\-\.]+\.fbcdn\.net\/[^"'\s)>]+\.(?:jpg|png|webp)[^"'\s)>]*/gi)];
      const seen = new Set<string>();
      previewHtmlDebug.albumImages = imgMatches
        .map(m => m[0].replace(/\\u003C/g, "<").replace(/\\/g, ""))
        .filter(url => {
          if (/[_]s?\d{1,3}x\d{1,3}[_.]/.test(url)) return false;
          if (/p64x64|s40x40|s50x50|emoji|sticker/i.test(url)) return false;
          const key = url.split("?")[0];
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 8);
    } catch (e: unknown) {
      previewHtmlDebug.error = String(e);
    }
  } else {
    previewHtmlDebug.error = "no iframe src found in preview body";
  }

  // Step 5: OG scraping from public post URL
  let ogDebug: { url?: string; status?: number; htmlLength?: number; albumImages?: string[]; error?: string } = {};
  if (sid) {
    const [pgId, postId] = sid.split("_");
    const postUrl = `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pgId}`;
    ogDebug.url = postUrl;
    try {
      const ogRes = await fetch(postUrl, {
        headers: {
          "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      ogDebug.status = ogRes.status;
      const html = await ogRes.text();
      ogDebug.htmlLength = html.length;
      const ogMatches = [...html.matchAll(/<meta[^>]+property="og:image(?::\w+)?"[^>]+content="([^"]+)"/gi)];
      const seen = new Set<string>();
      ogDebug.albumImages = ogMatches
        .map(m => m[1].replace(/&amp;/g, "&"))
        .filter(url => {
          const key = url.split("?")[0];
          if (seen.has(key)) return false;
          seen.add(key);
          return url.includes("fbcdn.net") || url.includes("facebook.com");
        })
        .slice(0, 8);
    } catch (e: unknown) {
      ogDebug.error = String(e);
    }
  }

  return NextResponse.json({ adRaw, creativeDirect, storyId: sid, postAttachments, previewHtmlDebug, ogDebug });
}
