import { FacebookApiError } from "@/lib/facebook";

const BASE = "https://graph.facebook.com/v21.0";

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

function geoList(geo: Json, regionNames: Intl.DisplayNames | null): string[] {
  if (!geo) return [];
  const out: string[] = [];
  for (const c of geo.countries ?? []) out.push(regionNames?.of(c) ?? c);
  for (const r of geo.regions ?? []) out.push(r.name);
  for (const c of geo.cities ?? []) out.push(c.radius ? `${c.name} (+${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})` : c.name);
  for (const c of geo.custom_locations ?? []) {
    const where = c.name ?? (c.latitude != null ? `${Number(c.latitude).toFixed(3)}, ${Number(c.longitude).toFixed(3)}` : "Pin");
    out.push(c.radius ? `${where} (r ${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})` : where);
  }
  for (const z of geo.zips ?? []) out.push(z.name ?? z.key);
  for (const g of geo.geo_markets ?? []) out.push(g.name);
  for (const g of geo.neighborhoods ?? []) out.push(g.name);
  return out;
}

const LOCATION_TYPE_LABEL: Record<string, string> = {
  home: "คนที่อาศัยอยู่ในพื้นที่",
  recent: "คนที่เพิ่งอยู่ในพื้นที่",
  travel_in: "คนที่เดินทางมาในพื้นที่",
};

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

// Reads the targeting of every Ad Set that the given ads belong to (one result per Ad Set).
export async function getAdsetTargets(adIds: string[], token: string): Promise<AdsetTarget[]> {
  const ids = [...new Set(adIds.filter(Boolean))];
  if (!ids.length) return [];

  const adToAdset = new Map<string, string>();
  const accountIds = new Set<string>();
  for (const part of chunk(ids, 40)) {
    const data = await graph(`${BASE}/?ids=${part.join(",")}&fields=adset_id,account_id&access_token=${token}`);
    for (const [adId, v] of Object.entries<Json>(data)) {
      if (v?.adset_id) adToAdset.set(adId, v.adset_id);
      if (v?.account_id) accountIds.add(`act_${v.account_id}`);
    }
  }

  const currencies = new Map<string, string>();
  if (accountIds.size) {
    try {
      const data = await graph(`${BASE}/?ids=${[...accountIds].join(",")}&fields=currency&access_token=${token}`);
      for (const [id, v] of Object.entries<Json>(data)) currencies.set(id.replace("act_", ""), v?.currency ?? "");
    } catch { /* currency is only cosmetic */ }
  }
  const currency = [...currencies.values()][0] || "THB";

  const adsetIds = [...new Set(adToAdset.values())];
  const adsByAdset = new Map<string, string[]>();
  for (const [adId, adsetId] of adToAdset) adsByAdset.set(adsetId, [...(adsByAdset.get(adsetId) ?? []), adId]);

  let regionNames: Intl.DisplayNames | null = null;
  try { regionNames = new Intl.DisplayNames(["th"], { type: "region" }); } catch { /* fall back to codes */ }

  const fields = "id,name,status,effective_status,optimization_goal,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,targeting,campaign{name,objective}";
  const results: AdsetTarget[] = [];
  for (const part of chunk(adsetIds, 25)) {
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
