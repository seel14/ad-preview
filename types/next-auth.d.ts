import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      // Per-user Redis partition key (`projects:{partitionKey}`, `fb_token:{partitionKey}`).
      // NOT a swap-safe opaque ID — it's currently the user's email (see auth.ts's session
      // callback for why: Google's OAuth `sub` claim was observed to change across sign-ins
      // in this app, which silently orphaned all per-user data keyed by it).
      partitionKey: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
