import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        // token.sub (Google's OAuth "sub") has been observed to change across separate
        // sign-ins in this app, which silently orphaned all per-user data (Projects,
        // Facebook connection) keyed by it. Email is confirmed stable across sessions,
        // so use it as the durable per-user partition key instead.
        session.user.partitionKey = token.email ?? token.sub ?? "";
      }
      return session;
    },
  },
});
