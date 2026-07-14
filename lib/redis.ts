import { Redis } from "@upstash/redis";

// Supports both Vercel KV (KV_REST_API_*) and Upstash (UPSTASH_REDIS_REST_*) env vars
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export interface SavedList {
  id: string;
  name: string;
  adIds: string[];
  createdAt: number;
}

export interface StructureNode {
  id: string;
  type: "platform" | "campaign" | "adset" | "ad";
  name: string;
  color?: string;
  meta?: Record<string, string>;
  children: StructureNode[];
}

export interface TimelineEntry {
  id: string;
  date: string; // "YYYY-MM-DD"
  channel?: string; // e.g. "Facebook", "Google", "TikTok"
  title: string;
  description?: string;
  details?: Record<string, string>;
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  token: string;
  adIds: string[];
  savedLists?: SavedList[];
  structure?: StructureNode[];
  timeline?: TimelineEntry[];
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
