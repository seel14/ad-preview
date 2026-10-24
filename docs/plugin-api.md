# Plugin API (read-only)

Lets the weekly-report plugin read a project's Ads Structure and Timeline without a browser login.

Env vars (Vercel + `.env.local`):
- `PLUGIN_API_KEY` secret (>= 24 chars), sent as `Authorization: Bearer <key>`
- `PLUGIN_OWNER_EMAIL` the Google email whose projects may be read (same as `session.user.partitionKey`)

Endpoints (GET only):
- `/api/plugin/projects` list `{id, name, updatedAt, structureNodes, timelineEntries}`
- `/api/plugin/projects/{id or exact name}?from=YYYY-MM-DD&to=YYYY-MM-DD&thumbs=1`
  returns `{id, name, updatedAt, fbAccountId, structure, structureFlat, timeline, range}`.
  `structureFlat` has one row per ad: platform, campaign, objective, campaignBudget, adset, adsetBudget, adsetKeywords, ad, adId, shared.
  Data-URL thumbnails are removed unless `thumbs=1`. The Facebook token and connection id are never returned.

Errors: 401 bad/missing key, 503 not configured, 404 project not found, 400 bad date.
