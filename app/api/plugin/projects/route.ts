import { NextResponse } from "next/server";
import { authorizePlugin } from "@/lib/pluginAuth";
import { getProjects, redis } from "@/lib/redis";

// GET /api/plugin/projects — list the owner's projects (read-only, Bearer PLUGIN_API_KEY)
export async function GET(req: Request) {
  const a = authorizePlugin(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const projects = await getProjects(a.owner);
  return NextResponse.json(projects.map(p => ({
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt,
    structureNodes: countNodes(p.structure ?? []),
    timelineEntries: (p.timeline ?? []).length,
  })));
}

function countNodes(nodes: { children?: unknown[] }[]): number {
  return nodes.reduce((n, x) => n + 1 + countNodes((x.children ?? []) as { children?: unknown[] }[]), 0);
}
