import { Redis } from "@upstash/redis";
import {
  createAimLeaderboardSnapshotFromEntries,
  createEmptyAimLeaderboardSnapshot,
  isAimLeaderboardEntry,
  normalizeAimLeaderboardEntries,
  normalizeAimPlayerName,
  type AimLeaderboardEntry,
  type AimLeaderboardSnapshot
} from "../src/aimLeaderboard";

declare const process: {
  readonly env: Record<string, string | undefined>;
};

interface ApiRequest {
  readonly method?: string;
  readonly body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(value: unknown): void;
}

const redisEntriesKey = "nh-trainer:aim-leaderboard:v1:entries";
const maxStoredEntries = 500;

let redisClient: Redis | null | undefined;

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  response.setHeader("Cache-Control", "no-store");

  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    response.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const redis = getRedisClient();
  if (!redis) {
    response.status(method === "POST" ? 503 : 200).json({
      mode: "local",
      leaderboard: createEmptyAimLeaderboardSnapshot(),
      error: method === "POST" ? "leaderboard_store_unconfigured" : undefined
    });
    return;
  }

  if (method === "GET") {
    await respondWithSharedLeaderboard(redis, response);
    return;
  }

  const entry = normalizeApiEntry(parseRequestBody(request.body));
  if (!entry) {
    response.status(400).json({ error: "invalid_leaderboard_entry" });
    return;
  }
  try {
    await redis.lpush(redisEntriesKey, JSON.stringify(entry));
    await redis.ltrim(redisEntriesKey, 0, maxStoredEntries - 1);
  } catch {
    response.status(500).json({ error: "leaderboard_save_failed" });
    return;
  }
  await respondWithSharedLeaderboard(redis, response);
}

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  redisClient = url && token ? new Redis({ url, token }) : null;
  return redisClient;
}

async function respondWithSharedLeaderboard(redis: Redis, response: ApiResponse): Promise<void> {
  try {
    response.status(200).json({
      mode: "shared",
      leaderboard: await readSharedLeaderboard(redis)
    });
  } catch {
    response.status(500).json({ error: "leaderboard_read_failed" });
  }
}

async function readSharedLeaderboard(redis: Redis): Promise<AimLeaderboardSnapshot> {
  const storedEntries = await redis.lrange<unknown>(redisEntriesKey, 0, maxStoredEntries - 1);
  return createAimLeaderboardSnapshotFromEntries(normalizeAimLeaderboardEntries(storedEntries.map(parseStoredEntry)));
}

function parseRequestBody(body: unknown): unknown {
  if (typeof body !== "string") {
    return body;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function parseStoredEntry(entry: unknown): unknown {
  if (typeof entry !== "string") {
    return entry;
  }
  try {
    return JSON.parse(entry);
  } catch {
    return null;
  }
}

function normalizeApiEntry(value: unknown): AimLeaderboardEntry | null {
  if (!isAimLeaderboardEntry(value)) {
    return null;
  }
  return {
    id: value.id.slice(0, 64),
    name: normalizeAimPlayerName(value.name),
    score: Math.trunc(value.score),
    misses: Math.trunc(value.misses),
    streak: Math.trunc(value.streak),
    completedAtMs: Math.trunc(value.completedAtMs),
    savedAtMs: Math.min(Date.now() + 60_000, Math.max(0, Math.trunc(value.savedAtMs)))
  };
}
