import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.partitionKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const { origin } = new URL(req.url);
  const redirectUri = `${origin}/api/auth/facebook/callback`;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "ads_read,ads_management,pages_read_engagement",
    response_type: "code",
    state: session.user.partitionKey,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/dialog/oauth?${params.toString()}`
  );
}
