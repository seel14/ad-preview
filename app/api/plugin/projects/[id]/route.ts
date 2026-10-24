import { NextResponse } from "next/server";
import { authorizePlugin } from "@/lib/pluginAuth";
import { getProjects, redis, type StructureNode, type TimelineEntry } from "@/lib/redis";

// GET /api/plugin/projects/{id|name}?from=YYYY-MM-DD&to=YYYY-MM-DD
// Read-only snapshot for the weekly-report plugin. Auth: Bearer PLUGIN_API_KEY.
// Never returns the Facebook token, connection ids or the data-URL thumbnails
// (use meta.adId to fetch creatives; thumbnail data URLs are only added with ?thumbs=1).

const DATE = /^\d{4}-\d{2}-\d{2}$/;

interface FlatRow {
  platform: string;
  campaign: string;
  objective: string;
  campaignBudget: string;
  adset: string; // "" for ads shared across ad sets
  adsetBudget: string;
  adsetKeywords: string;
  ad: string;
  adId: string;
  shared: boolean;
}

function budgetText(meta?: Record<string, string>): string {
  const b = meta?.budget?.trim();
  return b ? `${b} thb/${(meta?.budgetPeriod ?? "Day").toLowerCase()}` : "";
}

// One row per ad (plus one row for an ad set with no ads) so the plugin can group however it likes.
function flatten(tree: StructureNode[]): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const p of tree) {
    for (const c of p.children ?? []) {
      const base = {
        platform: p.name, campaign: c.name,
        objective: c.meta?.objective ?? "", campaignBudget: budgetText(c.meta),
      };
      for (const child of c.children ?? []) {
        if (child.type === "ad") {
          rows.push({ ...base, adset: "", adsetBudget: "", adsetKeywords: "", ad: child.name, adId: child.meta?.adId ?? "", shared: true });
          continue;
        }
        const ads = (child.children ?? []).filter(x => x.type === "ad");
        const common = { ...base, adset: child.name, adsetBudget: budgetText(child.meta), adsetKeywords: child.meta?.keywords ?? "" };
        if (!ads.length) rows.push({ ...common, ad: "", adId: "", shared: false });
        for (const ad of ads) rows.push({ ...common, ad: ad.name, adId: ad.meta?.adId ?? "", shared: false });
      }
    }
  }
  return rows;
}

function stripThumbs(nodes: StructureNode[], keepThumbs: boolean): StructureNode[] {
  return nodes.map(n => {
    const meta = n.meta ? { ...n.meta } : undefined;
    if (meta && !keepThumbs && meta.thumbnailUrl?.startsWith("data:")) delete meta.thumbnailUrl;
    return { ...n, meta, children: stripThumbs(n.children ?? [], keepThumbs) };
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = authorizePlugin(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const { id } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return NextResponse.json({ error: "bad_date" }, { status: 400 });

  const wanted = decodeURIComponent(id).trim().toLowerCase();
  const projects = await getProjects(a.owner);
  const project = projects.find(p => p.id === id) ?? projects.find(p => p.name.trim().toLowerCase() === wanted);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const keepThumbs = url.searchParams.get("thumbs") === "1";
  const structure = stripThumbs(project.structure ?? [], keepThumbs);
  const timeline: TimelineEntry[] = (project.timeline ?? [])
    .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
    .sort((x, y) => x.date.localeCompare(y.date))
    .map(e => ({ ...e, images: e.images?.map(i => ({ ...i, src: i.src.startsWith("data:") && !keepThumbs ? "" : i.src })) }));

  return NextResponse.json({
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    fbAccountId: project.fbAccountId ?? "",
    structure,
    structureFlat: flatten(structure),
    timeline,
    range: { from, to },
  });
}
