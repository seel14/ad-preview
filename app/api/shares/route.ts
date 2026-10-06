import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { redis, getProjects } from "@/lib/redis";
import { listShares, saveShare, newToken, type ShareRecord, type ShareScope } from "@/lib/share";

// GET — all share links of the signed-in user (summary only, no heavy snapshot payload)
export async function GET() {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const shares = await listShares(session.user.partitionKey);
  return NextResponse.json(shares.map(s => ({
    token: s.token,
    projectId: s.projectId,
    projectName: s.projectName,
    scope: s.scope,
    includeTarget: !!s.includeTarget,
    includeTimeline: !!s.includeTimeline,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    status: s.status,
    clientName: s.clientName ?? "",
    changes: s.changes,
  })));
}

// POST — create a share link from the project's current structure + loaded ads
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const scope: ShareScope = ["both", "preview", "structure", "none"].includes(body?.scope) ? body.scope : "both";
  const includeTarget = !!body?.includeTarget;
  const includeTimeline = !!body?.includeTimeline;
  const owner = session.user.partitionKey;
  const project = (await getProjects(owner)).find(p => p.id === body?.projectId);
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  const now = Date.now();
  const rec: ShareRecord = {
    token: newToken(),
    ownerKey: owner,
    projectId: project.id,
    projectName: project.name,
    scope,
    includeTarget,
    includeTimeline,
    createdAt: now,
    updatedAt: now,
    base: {
      structure: project.structure ?? [],
      ads: Array.isArray(body?.ads) ? body.ads : (project.cachedAds as never[]) ?? [],
      adEdits: {},
      timeline: includeTimeline ? (project.timeline ?? []) : undefined,
      targets: includeTarget ? (Array.isArray(body?.targets) ? body.targets : (project.cachedTargets as unknown[]) ?? []) : undefined,
    },
    changes: [],
    status: "idle",
  };
  await saveShare(rec);
  return NextResponse.json({ token: rec.token });
}
