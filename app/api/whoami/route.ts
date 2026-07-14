import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Debug endpoint — returns only the current session's user id/email (no project data),
// so the user can compare across browsers to confirm they're signed into the same account.
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ signedIn: false });
  return NextResponse.json({
    signedIn: true,
    partitionKey: session.user.partitionKey,
    email: session.user.email,
  });
}
