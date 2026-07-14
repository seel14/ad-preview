# Domain glossary — ad-preview

## FacebookAdsClient
Deep module at `lib/facebook.ts` that owns all interaction with Facebook's Graph API. Every route that needs Facebook data calls this instead of building raw `fetch()` calls to `graph.facebook.com` directly. Plain exported functions (no class/instance) — every verb takes the access token as a parameter.

Verbs:
- `exchangeCodeForToken(code, redirectUri)` — OAuth code → short-lived → long-lived (60-day) access token, one call
- `getAdAccounts(token)` — full list of ad accounts, paginated internally
- `getAds(accountId, token, filters?)` — ads + campaigns for an account, paginated internally
- `getAdPreview(adId, token)` — the composite "everything SlideView needs" fetch: ad + creative + preview iframe HTML + album-image fallback + campaign/adset/page names, normalized into one `AdPreview` shape

All verbs throw `FacebookApiError` on any Graph API error — callers catch once, at the route boundary.

## AdPreview
The bundle `getAdPreview()` returns: ad id/name/status, campaign/adset names, page info, preview iframe HTML, album-image fallback, and `creative` (still Graph's own nested `link_data`/`video_data`/flat-field shape — un-normalized). Candidate 5 (folding `SlideView`'s and `AdsStructure`'s independent creative-field fallback chains into one normalized shape here) is not done yet; `getAdPreview()` only consolidated the *fetching*, not the field shape.

## FacebookApiError
The one error type `lib/facebook.ts` throws for any Graph API failure (bad token, missing permission, invalid ad ID, etc). Carries the Graph API's own error message/code. Route handlers catch it once at the boundary and map to an HTTP response — no route hand-checks `.error` on a raw Graph JSON response anymore.

## lib/graphPaging.ts
Generic cursor-pagination helper (`fetchAllPages`) — follows Graph API's `paging.next` until exhausted. Not Facebook-specific in principle, kept as its own file. As of the `FacebookAdsClient` introduction, it's an internal dependency of `lib/facebook.ts` only — routes no longer import it directly.

## ExportSection / renderSectionsToPdf
Deep module inside `app/page.tsx` (not yet extracted to its own file — still closes over `Home()`'s state/refs) that all four PDF-producing export handlers (`handleExportPDF`, `handleExportCombined`, `handleExportCombinedLists`, `handleExportTimelinePDF`) build a list against instead of each re-implementing the jsPDF/html2canvas orchestration.

An `ExportSection` is one of: `{kind:"structure"}`, `{kind:"timeline"}`, `{kind:"divider", title, subtitle}`, `{kind:"ads", ads}`. `renderSectionsToPdf(sections)` walks the list, owns the single `jsPDF` instance, the `html2canvas` capture loop, the tab/platform switching, and the render-wait sequencing — callers just describe *what* goes in the PDF and in what order.

`handleExportStructure` (the standalone per-platform PNG-download export in Ads Structure) deliberately stays outside this — its sink is multiple downloaded PNG files, not one PDF, so folding it in would leak a "PDF vs PNGs" mode flag into the section-list interface. It shares `captureStructureChartCanvas()` (module-scope helper, `app/page.tsx`) with the "structure" section instead.

## useFacebookBrowser
Hook at `app/hooks/useFacebookBrowser.ts` — owns everything about browsing the connected Facebook account: connection status, ad accounts, ads/campaigns for the selected account, all the filter/search state, and connect/disconnect. Takes only the NextAuth session status as input; returns the same flat set of `fb*` values/setters `page.tsx`'s JSX already expected, so extracting it didn't require touching the JSX at all.

`Home()` in `app/page.tsx` still owns `handleAddFbAd` itself (reads `fbAds` from this hook, writes into `adIdsInput` which belongs to a different concern) — deliberately not folded into the hook, since "how a Facebook ad ID gets added to the textarea" isn't part of "browsing Facebook," it's part of the ad-loading workflow the hook has no business knowing about.

Project persistence (`projects`, `currentId`, CRUD, `selectProject`) was considered for the same treatment but left in `page.tsx` — `selectProject()` resets ad-loading state (`token`, `adIdsInput`, `ads`, `currentIndex`) as part of switching projects, a real domain coupling between "which project is active" and "what ad data is loaded" that a hook boundary would either have to leak through callbacks or falsely hide. Worth its own grilling pass if tackled later.

## splitCampaignChildren
Small helper in `app/components/AdsStructure.tsx` — a Campaign's `children` mixes `adset`-typed nodes (its ad sets) with `ad`-typed nodes (ads shared across all ad sets). `splitCampaignChildren(children)` returns `{ adsets, sharedAds }` so `CampaignNode` derives the split once instead of independently filtering `children` by `type` in three places.

Deliberately small-scope: a full discriminated-union redesign of `StructureNode` (e.g. giving Campaign an explicit `{ campaigns, sharedAds }` shape) was considered and rejected — the actual filtering-by-type footprint turned out to be 3 lines in one function, not the ~10 call sites an earlier architecture pass estimated, and the generic recursive tree walkers (`updateNode`/`removeNode` in the Root component, `useDragSort`) rely on every `StructureNode` having a uniform `children: StructureNode[]` shape regardless of `type` — special-casing Campaign there to support a real discriminated union would be a much bigger change than the 3-line problem it'd fix. Adset's own children are always ad-typed with no such overloading, so no equivalent helper is needed there.

## normalizeCreative
Pure function at `lib/normalizeCreative.ts` — resolves Facebook's inconsistent creative field layout (`object_story_spec.link_data` vs `.video_data` vs flat `creative` fields) into one `NormalizedCreative` shape: `{ image, headline, body, cta }`. Used by `SlideView.tsx` (field extraction for both the live iframe path and the exported `FbCard` mockup) and `AdsStructure.tsx`'s `getThumb()` — previously each had its own independent copy of the same `??` fallback chain.

Deliberately client-side only for now: `lib/facebook.ts`'s `getAdPreview()` still returns `creative` in Graph's raw nested shape (see `AdPreview` above) — normalizing there too was considered and deferred, since it'd change the API response shape and require updating `AdData.creative`'s type in both `page.tsx` and `SlideView.tsx` in lockstep. This pass only removed the *duplication* between the two client-side consumers, not the API contract.

## useProjectPersistence
Hook at `app/hooks/useProjectPersistence.ts` — owns the Project list, which one is active (`currentId`/`currentProject`), and all persistence to Redis: CRUD (`newProject`/`deleteProject`/`renameProject`), debounced token/adIds saves (`persistTokenAndAdIds`), and immediate field patches (`patchProject`, used by Saved Lists/Structure/Timeline edits — this replaced 4 near-identical `setProjects(...); fetch PUT ...` blocks that were independently re-implementing the same "patch one field, persist" pattern).

Deliberately does NOT own ad-loading state (`token`, `adIdsInput`, `ads`, `currentIndex`, `statusMsg`) — resolved the Candidate 3 coupling question by making `Home()` react to `currentId` changing via its own `useEffect`, instead of threading callbacks into the hook or letting the hook reach into ad-loading state directly. One-way data flow: the hook announces *which* project is active, `Home()` decides what that means for its own state.

## session.user.partitionKey
The per-user Redis partition key (`types/next-auth.d.ts`, set in `auth.ts`'s `session` callback) — used everywhere data is scoped to the signed-in user (`projects:{partitionKey}`, `fb_token:{partitionKey}`). Deliberately NOT named `.id`: it's currently the user's email, not an opaque identifier, because Google's OAuth `sub` claim was observed to be unstable in this app (see [ADR-0001](docs/adr/0001-use-email-as-user-partition-key.md)). Every route that reads `session.user.partitionKey` should treat it as "the current partitioning scheme," not as a permanent user ID.
