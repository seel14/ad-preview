// ── Google Ads search keywords (stored as JSON in node.meta.keywords) ─────────
export type MatchType = "Broad" | "Phrase" | "Exact";
export interface Keyword { t: string; m: MatchType }
export const MATCH_ORDER: MatchType[] = ["Broad", "Phrase", "Exact"];
export const MATCH_STYLE: Record<MatchType, { bg: string; fg: string }> = {
  Broad: { bg: "#dbeafe", fg: "#1e40af" },
  Phrase: { bg: "#fef3c7", fg: "#92400e" },
  Exact: { bg: "#dcfce7", fg: "#166534" },
};

export function parseKeywords(meta?: Record<string, string>): Keyword[] {
  try {
    const v = JSON.parse(meta?.keywords ?? "[]");
    return Array.isArray(v) ? uniqueKeywords(v.filter((k): k is Keyword => !!k && typeof k.t === "string" && MATCH_ORDER.includes(k.m))) : [];
  } catch { return []; }
}
// Same keyword text (case/space-insensitive) + same match type counts as a duplicate.
export function uniqueKeywords(list: Keyword[]): Keyword[] {
  const seen = new Set<string>();
  return list.filter(k => {
    const key = `${k.m}:${k.t.trim().toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function formatKeyword(k: Keyword) {
  return k.m === "Exact" ? `[${k.t}]` : k.m === "Phrase" ? `"${k.t}"` : k.t;
}
// "[kw]" → Exact only, "\"kw\"" → Phrase only, plain → every selected match type
export function parseKeywordLine(line: string, types: MatchType[]): Keyword[] {
  const raw = line.trim();
  if (!raw) return [];
  const exact = raw.match(/^\[(.+)\]$/);
  if (exact) return [{ t: exact[1].trim(), m: "Exact" }];
  const phrase = raw.match(/^["“](.+)["”]$/);
  if (phrase) return [{ t: phrase[1].trim(), m: "Phrase" }];
  return types.map(m => ({ t: raw, m }));
}

export function groupedKeywords(list: Keyword[]): { t: string; types: MatchType[] }[] {
  const groups: { t: string; types: MatchType[] }[] = [];
  for (const k of list) {
    const key = k.t.trim().toLowerCase();
    const g = groups.find(x => x.t.trim().toLowerCase() === key);
    if (g) { if (!g.types.includes(k.m)) g.types.push(k.m); }
    else groups.push({ t: k.t, types: [k.m] });
  }
  for (const g of groups) g.types.sort((a, b) => MATCH_ORDER.indexOf(a) - MATCH_ORDER.indexOf(b));
  return groups;
}

