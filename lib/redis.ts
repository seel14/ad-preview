import { Redis } from "@upstash/redis";

// Supports both Vercel KV (KV_REST_API_*) and Upstash (UPSTASH_REDIS_REST_*) env vars
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export interface Project {
  id: string;
  name: string;
  token: string;
  adIds: string[];
  createdAt: number;
  updatedAt: number;
}

const key = (userId: string) => `projects:${userId}`;

export async function getProjects(userId: string): Promise<Project[]> {
  if (!redis) return [];
  const data = await redis.get<Project[]>(key(userId));
  return data ?? [];
}

export async function saveProjects(userId: string, projects: Project[]): Promise<void> {
  if (!redis) throw new Error("Redis not configured");
  await redis.set(key(userId), projects);
}
