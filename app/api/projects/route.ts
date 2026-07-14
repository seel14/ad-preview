import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProjects, saveProjects, Project } from "@/lib/redis";
import { redis } from "@/lib/redis";

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// GET — list projects for the signed-in user
export async function GET() {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const projects = await getProjects(session.user.partitionKey);
  return NextResponse.json(projects);
}

// POST — create a new project
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.partitionKey) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!redis) return NextResponse.json({ error: "storage_not_configured" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name ?? "").trim() || "Untitled Project";

  const projects = await getProjects(session.user.partitionKey);
  const now = Date.now();
  const project: Project = {
    id: genId(),
    name,
    token: body.token ?? "",
    adIds: body.adIds ?? [],
    createdAt: now,
    updatedAt: now,
  };
  projects.unshift(project);
  await saveProjects(session.user.partitionKey, projects);
  return NextResponse.json(project);
}
