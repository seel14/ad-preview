# 0001 — Use email as the per-user Redis partition key, not Google's OAuth `sub`

## Status
Accepted (2026-07-13)

## Context
All per-user data (Projects, Facebook connection token) is stored in Redis keyed by a
string derived from the signed-in user's identity — `projects:{key}`, `fb_token:{key}`.

This app uses NextAuth v5 (beta) with the Google provider, JWT session strategy, and no
database adapter. Without a custom `jwt`/`session` callback, the framework's default
behavior sets `token.sub` (and therefore `session.user.id`) from the OAuth provider's
`profile.sub` field for OIDC providers — which is supposed to be Google's stable,
permanent subject identifier for that account.

In production, this was NOT stable: the same Google account, signed in from two
different browsers, produced two different `session.user.id` values (confirmed via a
debug endpoint comparing the two — both were UUID-shaped, not Google's actual numeric
`sub`, strongly suggesting the OIDC profile mapping was falling through to
`crypto.randomUUID()` for reasons not fully root-caused). Every fresh sign-in silently
orphaned all of that user's existing Projects and Facebook connection — data wasn't
lost, just unreachable under the new key.

## Decision
`auth.ts`'s `session` callback overrides `session.user.partitionKey` (see ADR title —
originally shipped as `session.user.id`, renamed once the field's real meaning was
made explicit) to `token.email`, confirmed stable across sessions/browsers for the same
account, instead of trusting `token.sub`.

## Consequences
- Any future NextAuth/Auth.js upgrade or config change that "fixes" this back to
  `token.sub` will silently reintroduce the orphaning bug. Don't revert without
  re-verifying `token.sub` is actually stable across fresh sign-ins first.
- The field is named `session.user.partitionKey`, not `.id`, specifically so it reads
  as "the key used to partition this user's data" rather than "a generic opaque user
  ID" — see `types/next-auth.d.ts` for the type-level documentation.
- If the app ever needs to support a user changing their Google account email, or
  adding a second OAuth provider, this partitioning scheme will need to change (email
  is not guaranteed permanent either, just more stable than the observed `sub`
  behavior in this app's environment).
- A small number of Projects created under the old, orphaned random-UUID keys were
  never migrated to the new email-based key (see prior session's handoff notes) — this
  is a known, separate cleanup task, not addressed by this ADR.
