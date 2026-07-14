import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { redis } from "@/lib/redis";
import { getAdAccounts } from "@/lib/facebook";

// GET /api/facebook — returns { connected, adAccounts }
export async function GET() {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!redis) return NextResponse.json({ connected: false });

  const token = await redis.get<string>(`fb_token:${session.user.partitionKey}`);
  if (!token) return NextResponse.json({ connected: false });

  try {
    const adAccounts = await getAdAccounts(token);
    return NextResponse.json({ connected: true, adAccounts });
  } catch {
    // Token may be expired — clear it
    await redis.del(`fb_token:${session.user.partitionKey}`);
    return NextResponse.json({ connected: false });
  }
}

// DELETE /api/facebook — disconnect
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (redis) await redis.del(`fb_token:${session.user.partitionKey}`);
  return NextResponse.json({ ok: true });
}
