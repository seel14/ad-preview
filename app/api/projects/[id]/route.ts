import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProjects, saveProjects } from "@/lib/redis";
import { redis } from "@/lib/redis";

// PUT — update a project (name, token, adIds)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const projects = await getProjects(session.user.partitionKey);
  const idx = projects.findIndex(p => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (body.name !== undefined) projects[idx].name = body.name;
  if (body.token !== undefined) projects[idx].token = body.token;
  if (body.adIds !== undefined) projects[idx].adIds = body.adIds;
  if (body.savedLists !== undefined) projects[idx].savedLists = body.savedLists;
  if (body.structure !== undefined) projects[idx].structure = body.structure;
  if (body.timeline !== undefined) projects[idx].timeline = body.timeline;
  projects[idx].updatedAt = Date.now();

  await saveProjects(session.user.partitionKey, projects);
  return NextResponse.json(projects[idx]);
}

// DELETE — remove a project
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const { id } = await params;
  const projects = await getProjects(session.user.partitionKey);
  const next = projects.filter(p => p.id !== id);
  await saveProjects(session.user.partitionKey, next);
  return NextResponse.json({ ok: true });
}
