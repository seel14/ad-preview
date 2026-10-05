import { FacebookApiError } from "@/lib/facebook";
import { fetchAllPages } from "@/lib/graphPaging";

const BASE = "https://graph.facebook.com/v21.0";

export interface GeoPoint { label: string; lat: number; lng: number; radiusKm: number | null; excluded: boolean }

export interface TargetGroup { label: string; items: string[] }

export interface AdsetTarget {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  objective: string;
  status: string;
  optimizationGoal: string;
  bidStrategy: string;
  budget: string;
  schedule: string;
  adIds: string[];
  locations: string[];
  excludedLocations: string[];
  locationTypes: string[];
  geoPoints: GeoPoint[];
  age: string;
  genders: string;
  detailed: TargetGroup[];
  excludedDetailed: TargetGroup[];
  customAudiences: string[];
  excludedAudiences: string[];
  placements: string[];
  devices: string[];
  advantage: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function graph(url: string): Promise<Json> {
  const res = await fetch(url);
  const data = await res.json();
  if (data?.error) throw new FacebookApiError(data.error.message ?? "graph_api_error", data.error.code);
  return data;
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "PYG", "XOF", "XAF", "KMF", "RWF"]);

const GROUP_LABELS: Record<string, string> = {
  interests: "Interests",
  behaviors: "Behaviors",
  life_events: "Life events",
  family_statuses: "Parental status",
  relationship_statuses: "Relationship",
  income: "Income",
  industries: "Industries",
  work_positions: "Job titles",
  work_employers: "Employers",
  education_statuses: "Education level",
  education_schools: "Schools",
  education_majors: "Fields of study",
  user_adclusters: "Demographics",
  politics: "Politics",
  generation: "Generation",
  interested_in: "Interested in",
  college_years: "Graduation year",
};

const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

function groupsFrom(specs: Json): TargetGroup[] {
  const byLabel = new Map<string, Set<string>>();
  const list: Json[] = Array.isArray(specs) ? specs : specs ? [specs] : [];
  for (const spec of list) {
    for (const [key, value] of Object.entries(spec ?? {})) {
      if (!Array.isArray(value)) continue;
      const label = GROUP_LABELS[key] ?? titleCase(key);
      const set = byLabel.get(label) ?? new Set<string>();
      for (const v of value) set.add(typeof v === "string" || typeof v === "number" ? String(v) : (v?.name ?? String(v?.id ?? "")));
      byLabel.set(label, set);
    }
  }
  return [...byLabel].map(([label, set]) => ({ label, items: [...set].filter(Boolean) })).filter(g => g.items.length);
}

const GEO_GROUP_LABEL: Record<string, string> = { worldwide: "ทั่วโลก", europe: "Europe", asia: "Asia", nafta: "NAFTA", eea: "EEA" };
const GEO_KNOWN_KEYS = new Set(["location_types", "countries", "regions", "cities", "custom_locations", "zips", "geo_markets", "neighborhoods", "country_groups"]);

function geoList(geo: Json, regionNames: Intl.DisplayNames | null): string[] {
  if (!geo) return [];
  const out: string[] = [];
  for (const c of geo.countries ?? []) out.push(regionNames?.of(c) ?? c);
  for (const g of geo.country_groups ?? []) out.push(GEO_GROUP_LABEL[g] ?? titleCase(String(g)));
  for (const r of geo.regions ?? []) out.push(r.name ?? r.key);
  for (const c of geo.cities ?? []) out.push(c.radius ? `${c.name} (+${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})` : c.name);
  for (const c of geo.custom_locations ?? []) {
    const where = c.name ?? (c.latitude != null ? `${Number(c.latitude).toFixed(3)}, ${Number(c.longitude).toFixed(3)}` : "Pin");
    out.push(c.radius ? `${where} (r ${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})` : where);
  }
  for (const z of geo.zips ?? []) out.push(z.name ?? z.key);
  for (const g of geo.geo_markets ?? []) out.push(g.name ?? g.key);
  for (const g of geo.neighborhoods ?? []) out.push(g.name ?? g.key);
  // Any other geo shape Meta returns (places, electoral districts, metro areas, ...): show it instead of dropping it.
  for (const [key, value] of Object.entries<Json>(geo)) {
    if (GEO_KNOWN_KEYS.has(key) || value == null) continue;
    if (Array.isArray(value)) {
      for (const v of value) out.push(typeof v === "object" ? `${titleCase(key)}: ${v?.name ?? v?.key ?? JSON.stringify(v).slice(0, 60)}${v?.radius ? ` (+${v.radius} ${v.distance_unit === "mile" ? "mi" : "km"})` : ""}` : `${titleCase(key)}: ${v}`);
    } else if (typeof value !== "object") {
      out.push(`${titleCase(key)}: ${value}`);
    }
  }
  return out.filter(Boolean);
}

const LOCATION_TYPE_LABEL: Record<string, string> = {
  home: "คนที่อาศัยอยู่ในพื้นที่",
  recent: "คนที่เพิ่งอยู่ในพื้นที่",
  travel_in: "คนที่เดินทางมาในพื้นที่",
};

const toKm = (r: number | undefined, unit: string | undefined) => (r ? (unit === "mile" ? r * 1.609344 : r) : null);

let geocodeBudget = 20; // per request: keeps the call within the serverless time limit
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
// `query` is a free-text search, or a `postalcode=10110&country=th` style structured search.
async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (geocodeCache.has(query)) return geocodeCache.get(query)!;
  let result: { lat: number; lng: number } | null = null;
  try {
    const search = query.startsWith("postalcode=") ? query : `q=${encodeURIComponent(query)}`;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&${search}`, {
      headers: { "User-Agent": "ad-preview-app/1.0 (ad targeting report)", "Accept-Language": "en" },
    });
    const data = await res.json();
    if (Array.isArray(data) && data[0]) result = { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch { /* map is optional */ }
  geocodeCache.set(query, result);
  return result;
}

// Pin drops carry coordinates; cities only have a name + radius, so they are geocoded (OpenStreetMap Nominatim).
async function geoPointsFrom(geo: Json, excluded: boolean, countryNames: Intl.DisplayNames | null): Promise<GeoPoint[]> {
  if (!geo) return [];
  const out: GeoPoint[] = [];
  for (const c of geo.custom_locations ?? []) {
    if (c.latitude == null || c.longitude == null) continue;
    out.push({ label: c.name ?? "Pin", lat: Number(c.latitude), lng: Number(c.longitude), radiusKm: toKm(c.radius, c.distance_unit), excluded });
  }
  for (const c of (geo.cities ?? []).slice(0, 10)) {
    const country = c.country ? (new Intl.DisplayNames(["en"], { type: "region" }).of(c.country) ?? c.country) : "";
    const q = [c.name, c.region, country].filter(Boolean).join(", ");
    const cached = geocodeCache.has(q);
    if (!cached && geocodeBudget <= 0) continue;
    if (!cached) geocodeBudget--;
    const pos = await geocode(q);
    if (pos) out.push({ label: c.name, ...pos, radiusKm: toKm(c.radius, c.distance_unit), excluded });
    if (!cached) await new Promise(r => setTimeout(r, 1100)); // Nominatim usage policy: max 1 request/second
  }
  // Places (hospitals, malls, ...) and any other pinned location type: use their coordinates when Meta sends them,
  // otherwise look the place up by name.
  for (const [key, value] of Object.entries<Json>(geo)) {
    if (GEO_KNOWN_KEYS.has(key) || !Array.isArray(value)) continue;
    for (const v of value.slice(0, 12)) {
      if (!v || typeof v !== "object") continue;
      const label = v.name ?? v.key ?? "";
      const radiusKm = toKm(v.radius, v.distance_unit);
      if (v.latitude != null && v.longitude != null) {
        out.push({ label, lat: Number(v.latitude), lng: Number(v.longitude), radiusKm, excluded });
        continue;
      }
      if (!label) continue;
      const q = [label, v.region, v.country_code ?? v.country].filter(Boolean).join(", ");
      const cached = geocodeCache.has(q);
      if (!cached && geocodeBudget <= 0) continue;
      if (!cached) geocodeBudget--;
      const pos = await geocode(q);
      if (pos) out.push({ label, ...pos, radiusKm, excluded });
      if (!cached) await new Promise(r => setTimeout(r, 1100));
    }
  }
  // Postcodes come as codes only ("TH:10110") — pin the centre point of each one.
  for (const z of (geo.zips ?? []).slice(0, 12)) {
    const [cc, ...rest] = String(z.key ?? "").split(":");
    const code = (z.name ?? rest.join(":") ?? "").toString().trim();
    if (!code) continue;
    const q = `postalcode=${encodeURIComponent(code)}${cc && cc.length === 2 ? `&country=${cc.toLowerCase()}` : ""}`;
    const cached = geocodeCache.has(q);
    if (!cached && geocodeBudget <= 0) continue;
    if (!cached) geocodeBudget--;
    const pos = await geocode(q);
    if (pos) out.push({ label: code, ...pos, radiusKm: null, excluded });
    if (!cached) await new Promise(r => setTimeout(r, 1100));
  }
  void countryNames;
  return out;
}

function placementLines(t: Json): string[] {
  const platforms: string[] | undefined = t.publisher_platforms;
  if (!platforms?.length) return ["Advantage+ placements (อัตโนมัติ)"];
  const posKey: Record<string, string> = {
    facebook: "facebook_positions", instagram: "instagram_positions",
    messenger: "messenger_positions", audience_network: "audience_network_positions",
  };
  return platforms.map(p => {
    const pos: string[] = t[posKey[p]] ?? [];
    return pos.length ? `${titleCase(p)}: ${pos.map(titleCase).join(", ")}` : `${titleCase(p)}: ทุกตำแหน่ง`;
  });
}

function formatMoney(minor: string | undefined, currency: string): string {
  if (!minor) return "";
  const value = Number(minor) / (ZERO_DECIMAL.has(currency) ? 1 : 100);
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" }) : "";

export interface AdsetOption { id: string; name: string; status: string; campaignName: string; adIds: string[] }

// Ad Sets that the given ads belong to (one row per Ad Set), without loading targeting yet.
export async function listAdsetsForAds(adIds: string[], token: string): Promise<AdsetOption[]> {
  const ids = [...new Set(adIds.filter(Boolean))];
  const adsByAdset = new Map<string, string[]>();
  for (const part of chunk(ids, 40)) {
    const data = await graph(`${BASE}/?ids=${part.join(",")}&fields=adset_id&access_token=${token}`);
    for (const [adId, v] of Object.entries<Json>(data)) {
      if (v?.adset_id) adsByAdset.set(v.adset_id, [...(adsByAdset.get(v.adset_id) ?? []), adId]);
    }
  }
  const out: AdsetOption[] = [];
  for (const part of chunk([...adsByAdset.keys()], 40)) {
    const data = await graph(`${BASE}/?ids=${part.join(",")}&fields=${encodeURIComponent("id,name,effective_status,campaign{name}")}&access_token=${token}`);
    for (const id of part) {
      const a: Json = data[id];
      if (a) out.push({ id: a.id, name: a.name ?? "", status: a.effective_status ?? "", campaignName: a.campaign?.name ?? "", adIds: adsByAdset.get(id) ?? [] });
    }
  }
  return out;
}

// Every Ad Set in an ad account.
export async function listAdsetsForAccount(accountId: string, token: string): Promise<AdsetOption[]> {
  const acct = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  try {
    const rows = await fetchAllPages<Json>(`${BASE}/${acct}/adsets?fields=${encodeURIComponent("id,name,effective_status,campaign{name}")}&limit=200&access_token=${token}`);
    return rows.map(a => ({ id: a.id, name: a.name ?? "", status: a.effective_status ?? "", campaignName: a.campaign?.name ?? "", adIds: [] }));
  } catch (e) {
    throw new FacebookApiError(e instanceof Error ? e.message : "graph_api_error");
  }
}

// Reads the targeting of the chosen Ad Sets. `adIdsByAdset` (optional) lists which loaded ads belong to each.
export async function getAdsetTargets(adsetIds: string[], token: string, adIdsByAdset: Record<string, string[]> = {}): Promise<AdsetTarget[]> {
  const adsetIdList = [...new Set(adsetIds.filter(Boolean))];
  if (!adsetIdList.length) return [];
  geocodeBudget = 20;
  const adsByAdset = new Map<string, string[]>(Object.entries(adIdsByAdset));

  const accountIds = new Set<string>();
  for (const part of chunk(adsetIdList, 40)) {
    const data = await graph(`${BASE}/?ids=${part.join(",")}&fields=account_id&access_token=${token}`);
    for (const v of Object.values<Json>(data)) if (v?.account_id) accountIds.add(`act_${v.account_id}`);
  }
  const currencies = new Map<string, string>();
  if (accountIds.size) {
    try {
      const data = await graph(`${BASE}/?ids=${[...accountIds].join(",")}&fields=currency&access_token=${token}`);
      for (const [id, v] of Object.entries<Json>(data)) currencies.set(id.replace("act_", ""), v?.currency ?? "");
    } catch { /* currency is only cosmetic */ }
  }
  const currency = [...currencies.values()][0] || "THB";
  const adsetIdsAll = adsetIdList;

  let regionNames: Intl.DisplayNames | null = null;
  try { regionNames = new Intl.DisplayNames(["th"], { type: "region" }); } catch { /* fall back to codes */ }

  const fields = "id,name,status,effective_status,optimization_goal,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,targeting,campaign{name,objective}";
  const results: AdsetTarget[] = [];
  for (const part of chunk(adsetIdsAll, 25)) {
    const data = await graph(`${BASE}/?ids=${part.join(",")}&fields=${encodeURIComponent(fields)}&access_token=${token}`);
    for (const id of part) {
      const a: Json = data[id];
      if (!a) continue;
      const t: Json = a.targeting ?? {};
      const ageMin = t.age_min ?? 18;
      const ageMax = t.age_max ?? 65;
      const genders: number[] = t.genders ?? [];
      const advantage: string[] = [];
      if (t.targeting_automation?.advantage_audience === 1) advantage.push("Advantage+ audience");
      if (t.targeting_relaxation_types?.lookalike === 1) advantage.push("Lookalike expansion");
      if (t.targeting_relaxation_types?.custom_audience === 1) advantage.push("Custom audience expansion");

      results.push({
        adsetId: a.id,
        adsetName: a.name ?? "",
        campaignName: a.campaign?.name ?? "",
        objective: a.campaign?.objective ? titleCase(String(a.campaign.objective).replace(/^OUTCOME_/, "")) : "",
        status: a.effective_status ?? a.status ?? "",
        optimizationGoal: a.optimization_goal ? titleCase(a.optimization_goal) : "",
        bidStrategy: a.bid_strategy ? titleCase(a.bid_strategy) : "",
        budget: a.daily_budget ? `${formatMoney(a.daily_budget, currency)} / วัน`
          : a.lifetime_budget ? `${formatMoney(a.lifetime_budget, currency)} (ตลอดแคมเปญ)`
          : "ใช้งบระดับ Campaign",
        schedule: [fmtDate(a.start_time), a.end_time ? fmtDate(a.end_time) : "ไม่กำหนดวันสิ้นสุด"].filter(Boolean).join(" – "),
        adIds: adsByAdset.get(a.id) ?? [],
        locations: geoList(t.geo_locations, regionNames),
        excludedLocations: geoList(t.excluded_geo_locations, regionNames),
        locationTypes: (t.geo_locations?.location_types ?? []).map((x: string) => LOCATION_TYPE_LABEL[x] ?? x),
        geoPoints: [...(await geoPointsFrom(t.geo_locations, false, regionNames)), ...(await geoPointsFrom(t.excluded_geo_locations, true, regionNames))],
        age: ageMax >= 65 ? `${ageMin} – 65+` : `${ageMin} – ${ageMax}`,
        genders: !genders.length || genders.length > 1 ? "ทุกเพศ" : genders[0] === 1 ? "ชาย" : "หญิง",
        detailed: groupsFrom(t.flexible_spec),
        excludedDetailed: groupsFrom(t.exclusions),
        customAudiences: (t.custom_audiences ?? []).map((c: Json) => c.name ?? c.id),
        excludedAudiences: (t.excluded_custom_audiences ?? []).map((c: Json) => c.name ?? c.id),
        placements: placementLines(t),
        devices: [...(t.device_platforms ?? []).map(titleCase), ...(t.user_os ?? [])],
        advantage,
      });
    }
  }
  return results;
}
