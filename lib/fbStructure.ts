import { FacebookApiError } from "@/lib/facebook";
import { fetchAllPages } from "@/lib/graphPaging";
import type { StructureNode } from "@/lib/redis";

const BASE = "https://graph.facebook.com/v21.0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const act = (id: string) => (id.startsWith("act_") ? id : `act_${id}`);
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD", "UGX", "PYG", "XOF", "XAF", "KMF", "RWF"]);
const uid = () => Math.random().toString(36).slice(2, 10);
const titleCase = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

async function pages<T = Json>(url: string): Promise<T[]> {
  try {
    return await fetchAllPages<T>(url);
  } catch (e) {
    throw new FacebookApiError(e instanceof Error ? e.message : "graph_api_error");
  }
}

export interface CampaignRow { id: string; name: string; status: string; objective: string }

export async function listCampaigns(accountId: string, token: string): Promise<CampaignRow[]> {
  const rows = await pages(`${BASE}/${act(accountId)}/campaigns?fields=${encodeURIComponent("id,name,effective_status,objective")}&limit=200&access_token=${token}`);
  return rows.map(c => ({ id: c.id, name: c.name ?? "", status: c.effective_status ?? "", objective: c.objective ? titleCase(String(c.objective).replace(/^OUTCOME_/, "")) : "" }));
}

// Campaign → Ad Set → Ad names (and budgets) of the chosen campaigns, as Ads Structure nodes.
export async function getCampaignStructure(accountId: string, campaignIds: string[], token: string): Promise<StructureNode[]> {
  const ids = [...new Set(campaignIds)].filter(x => /^\d+$/.test(x));
  if (!ids.length) return [];
  const filtering = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]));

  let currency = "THB";
  try {
    const r = await fetch(`${BASE}/${act(accountId)}?fields=currency&access_token=${token}`);
    const d = await r.json();
    if (d?.currency) currency = d.currency;
  } catch { /* cosmetic */ }
  const money = (minor?: string) => minor ? String(Number(minor) / (ZERO_DECIMAL.has(currency) ? 1 : 100)) : "";

  const [campaigns, adsets, ads] = await Promise.all([
    pages(`${BASE}/${act(accountId)}/campaigns?fields=${encodeURIComponent("id,name,effective_status,objective,daily_budget,lifetime_budget")}&filtering=${filtering}&limit=200&access_token=${token}`),
    pages(`${BASE}/${act(accountId)}/adsets?fields=${encodeURIComponent("id,name,effective_status,campaign_id,daily_budget,lifetime_budget")}&filtering=${filtering}&limit=200&access_token=${token}`),
    pages(`${BASE}/${act(accountId)}/ads?fields=${encodeURIComponent("id,name,effective_status,adset_id,campaign_id,creative{thumbnail_url,image_url}")}&filtering=${filtering}&limit=200&access_token=${token}`),
  ]);

  const budgetMeta = (n: Json): Record<string, string> => {
    if (n.daily_budget) return { budget: money(n.daily_budget), budgetPeriod: "Day" };
    if (n.lifetime_budget) return { budget: money(n.lifetime_budget), budgetPeriod: "Lifetime" };
    return {};
  };

  const adNode = (a: Json): StructureNode => ({
    id: uid(), type: "ad", name: a.name ?? "", children: [],
    meta: { adId: a.id, fbStatus: a.effective_status ?? "", thumbnailUrl: a.creative?.thumbnail_url ?? a.creative?.image_url ?? "" },
  });

  return ids
    .map(id => campaigns.find(c => c.id === id))
    .filter((c): c is Json => !!c)
    .map(c => ({
      id: uid(), type: "campaign" as const, name: c.name ?? "",
      meta: { ...budgetMeta(c), fbId: c.id, fbStatus: c.effective_status ?? "", ...(c.objective ? { objective: titleCase(String(c.objective).replace(/^OUTCOME_/, "")) } : {}) },
      children: adsets.filter(s => s.campaign_id === c.id).map(s => ({
        id: uid(), type: "adset" as const, name: s.name ?? "",
        meta: { ...budgetMeta(s), fbId: s.id, fbStatus: s.effective_status ?? "" },
        children: ads.filter(a => a.adset_id === s.id).map(adNode),
      })),
    }));
}
