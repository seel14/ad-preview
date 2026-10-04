import { redis, getProjects, saveProjects, type StructureNode } from "./redis";
import { normalizeCreative, type RawCreative } from "./normalizeCreative";

export type ShareScope = "both" | "preview" | "structure";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ShareAd = { id: string; name: string; creative?: any; previewHtml?: string | null; albumImages?: string[]; page?: unknown; shareLink?: string | null; [k: string]: unknown };

export interface AdEdit { body?: string; headline?: string; description?: string }
export type AdEdits = Record<string, AdEdit>;

export interface ShareChange {
  area: "structure" | "ad";
  action: "added" | "removed" | "renamed" | "updated" | "moved";
  path: string;
  field?: string;
  from?: string;
  to?: string;
}

export interface ShareRecord {
  token: string;
  ownerKey: string;
  projectId: string;
  projectName: string;
  scope: ShareScope;
  createdAt: number;
  base: { structure: StructureNode[]; ads: ShareAd[]; adEdits: AdEdits };
  draft?: { structure: StructureNode[]; adEdits: AdEdits };
  changes: ShareChange[];
  status: "idle" | "pending";
  clientName?: string;
  updatedAt: number;
}

const shareKey = (token: string) => `share:${token}`;
const ownerKey = (owner: string) => `shares:${owner}`;

export function newToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 28);
}

export async function getShare(token: string): Promise<ShareRecord | null> {
  if (!redis || !/^[a-f0-9]{20,40}$/.test(token)) return null;
  return (await redis.get<ShareRecord>(shareKey(token))) ?? null;
}

export async function saveShare(rec: ShareRecord) {
  if (!redis) throw new Error("Redis not configured");
  await redis.set(shareKey(rec.token), rec);
  await redis.sadd(ownerKey(rec.ownerKey), rec.token);
}

export async function deleteShare(rec: ShareRecord) {
  if (!redis) return;
  await redis.del(shareKey(rec.token));
  await redis.srem(ownerKey(rec.ownerKey), rec.token);
}

export async function listShares(owner: string): Promise<ShareRecord[]> {
  if (!redis) return [];
  const tokens = (await redis.smembers(ownerKey(owner))) as string[];
  if (!tokens.length) return [];
  const recs = await redis.mget<(ShareRecord | null)[]>(...tokens.map(shareKey));
  return recs.filter((r): r is ShareRecord => !!r).sort((a, b) => b.createdAt - a.createdAt);
}

// ── Diff ─────────────────────────────────────────────────────────────────────

interface Indexed { node: StructureNode; parentId: string | null; path: string }

function indexTree(nodes: StructureNode[]): Map<string, Indexed> {
  const map = new Map<string, Indexed>();
  const walk = (list: StructureNode[], parentId: string | null, prefix: string) => {
    for (const n of list) {
      const path = prefix ? `${prefix} › ${n.name || "(ไม่มีชื่อ)"}` : n.name || "(ไม่มีชื่อ)";
      map.set(n.id, { node: n, parentId, path });
      walk(n.children ?? [], n.id, path);
    }
  };
  walk(nodes, null, "");
  return map;
}

const META_LABELS: Record<string, string> = { budget: "Budget", budgetPeriod: "Budget period" };

export function diffStructure(base: StructureNode[], draft: StructureNode[]): ShareChange[] {
  const a = indexTree(base);
  const b = indexTree(draft);
  const out: ShareChange[] = [];

  for (const [id, it] of a) {
    if (b.has(id)) continue;
    if (it.parentId && !b.has(it.parentId) && a.has(it.parentId)) continue; // reported via its removed ancestor
    out.push({ area: "structure", action: "removed", path: it.path });
  }
  for (const [id, it] of b) {
    if (a.has(id)) continue;
    if (it.parentId && !a.has(it.parentId)) continue; // reported via its added ancestor
    out.push({ area: "structure", action: "added", path: it.path });
  }
  for (const [id, now] of b) {
    const was = a.get(id);
    if (!was) continue;
    if (was.node.name !== now.node.name) {
      out.push({ area: "structure", action: "renamed", path: was.path, from: was.node.name, to: now.node.name });
    }
    if (was.parentId !== now.parentId) {
      out.push({ area: "structure", action: "moved", path: now.path, from: was.path, to: now.path });
    }
    for (const key of ["budget", "budgetPeriod"]) {
      const from = was.node.meta?.[key] ?? "";
      const to = now.node.meta?.[key] ?? "";
      if (from !== to) out.push({ area: "structure", action: "updated", path: now.path, field: META_LABELS[key], from, to });
    }
    const kwText = (m?: Record<string, string>) => {
      try {
        const v = JSON.parse(m?.keywords ?? "[]") as { t: string; m: string }[];
        return Array.isArray(v) ? v.map(k => `${k.m === "Exact" ? `[${k.t}]` : k.m === "Phrase" ? `"${k.t}"` : k.t} (${k.m})`).join(", ") : "";
      } catch { return ""; }
    };
    const kwFrom = kwText(was.node.meta);
    const kwTo = kwText(now.node.meta);
    if (kwFrom !== kwTo) out.push({ area: "structure", action: "updated", path: now.path, field: "Keywords", from: kwFrom, to: kwTo });
  }
  return out;
}

const AD_FIELDS: { key: keyof AdEdit; label: string }[] = [
  { key: "body", label: "Primary text" },
  { key: "headline", label: "Headline" },
  { key: "description", label: "Description" },
];

export function originalAdText(ad: ShareAd | undefined): AdEdit {
  if (!ad?.creative) return {};
  const n = normalizeCreative(ad.creative as RawCreative);
  const description = (ad.creative as RawCreative).object_story_spec?.link_data?.description ?? "";
  return { body: n.body, headline: n.headline, description };
}

export function diffAdEdits(ads: ShareAd[], baseEdits: AdEdits, draftEdits: AdEdits): ShareChange[] {
  const out: ShareChange[] = [];
  const byId = new Map(ads.map(a => [a.id, a]));
  for (const [adId, edit] of Object.entries(draftEdits)) {
    const ad = byId.get(adId);
    const original = originalAdText(ad);
    for (const { key, label } of AD_FIELDS) {
      if (edit[key] === undefined) continue;
      const current = baseEdits[adId]?.[key] ?? original[key] ?? "";
      if (edit[key] !== current) {
        out.push({ area: "ad", action: "updated", path: ad?.name ?? adId, field: label, from: current, to: edit[key] });
      }
    }
  }
  return out;
}

// ── Accept (owner action): applies the client's draft to the real project ────

export async function acceptShare(rec: ShareRecord): Promise<boolean> {
  if (!rec.draft) return false;
  const projects = await getProjects(rec.ownerKey);
  const p = projects.find(x => x.id === rec.projectId);
  if (p) {
    if (rec.scope !== "preview") p.structure = rec.draft.structure;
    if (rec.scope !== "structure" && Array.isArray(p.cachedAds)) {
      p.cachedAds = (p.cachedAds as ShareAd[]).map(ad => applyEditToAd(ad, rec.draft!.adEdits[ad.id]));
    }
    p.updatedAt = Date.now();
    await saveProjects(rec.ownerKey, projects);
  }
  rec.base = {
    structure: rec.draft.structure,
    ads: rec.base.ads.map(ad => applyEditToAd(ad, rec.draft!.adEdits[ad.id])),
    adEdits: {},
  };
  rec.draft = undefined;
  rec.changes = [];
  rec.status = "idle";
  rec.updatedAt = Date.now();
  await saveShare(rec);
  return !!p;
}

export function applyEditToAd(ad: ShareAd, edit?: AdEdit): ShareAd {
  if (!edit || !ad.creative) return ad;
  const creative = { ...ad.creative };
  const ld = creative.object_story_spec?.link_data;
  if (edit.body !== undefined) {
    creative.body = edit.body;
    if (ld) creative.object_story_spec = { ...creative.object_story_spec, link_data: { ...creative.object_story_spec.link_data, message: edit.body } };
  }
  if (edit.headline !== undefined) {
    creative.title = edit.headline;
    if (ld) creative.object_story_spec = { ...creative.object_story_spec, link_data: { ...creative.object_story_spec.link_data, name: edit.headline } };
  }
  if (edit.description !== undefined && ld) {
    creative.object_story_spec = { ...creative.object_story_spec, link_data: { ...creative.object_story_spec.link_data, description: edit.description } };
  }
  return { ...ad, creative };
}
