import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { exchangeCodeForToken } from "@/lib/facebook";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !userId) {
    return NextResponse.redirect(`${origin}/?fb_error=cancelled`);
  }

  const redirectUri = `${origin}/api/auth/facebook/callback`;

  try {
    const { accessToken } = await exchangeCodeForToken(code, redirectUri);
    if (redis) {
      await redis.set(`fb_token:${userId}`, accessToken, { ex: 60 * 24 * 3600 }); // 60 days
    }
    return NextResponse.redirect(`${origin}/?fb_connected=1`);
  } catch {
    return NextResponse.redirect(`${origin}/?fb_error=token_failed`);
  }
}
