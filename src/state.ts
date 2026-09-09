import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MatchRecord, MonitorState } from "./types";

export function emptyState(username: string, keyword: string): MonitorState {
  return {
    version: 3,
    username,
    keyword,
    userId: null,
    sinceId: null,
    lastCheckedAt: null,
    lastSuccessAt: null,
    lastRunStatus: "waiting-for-first-run",
    postsScanned: 0,
    matches: [],
    outbox: [],
    seen: {},
  };
}

function migrateMatch(match: Record<string, unknown>): MatchRecord {
  const id = String(match.id ?? "");
  const createdAt = typeof match.createdAt === "string" ? match.createdAt : null;
  const notifiedAt =
    typeof match.notifiedAt === "string" ? match.notifiedAt : undefined;
  return {
    version:
      typeof match.version === "string" ? match.version : `legacy:${id}:${createdAt ?? "unknown"}`,
    id,
    text: String(match.text ?? ""),
    createdAt,
    url: String(match.url ?? ""),
    media: Array.isArray(match.media) ? (match.media as MatchRecord["media"]) : [],
    detectedAt:
      typeof match.detectedAt === "string"
        ? match.detectedAt
        : notifiedAt ?? createdAt ?? new Date(0).toISOString(),
    events: Array.isArray(match.events)
      ? (match.events as MatchRecord["events"])
      : [],
    notifiedAt,
    channels: Array.isArray(match.channels)
      ? match.channels.filter((value): value is string => typeof value === "string")
      : [],
  };
}

export async function readState(
  path: string,
  username: string,
  keyword: string,
): Promise<MonitorState> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (raw.username !== username || raw.keyword !== keyword)
      throw new Error(
        "State belongs to a different account or keyword; use a new STATE_PATH",
      );
    if (
      !Array.isArray(raw.matches) ||
      !Number.isFinite(raw.postsScanned) ||
      (raw.sinceId !== null && raw.sinceId !== undefined && !/^\d+$/.test(String(raw.sinceId)))
    )
      throw new Error("Invalid monitor state; restore a known-good backup");
    if (raw.version !== undefined && raw.version !== 2 && raw.version !== 3)
      throw new Error("Unsupported state version");

    const state = raw as unknown as MonitorState;
    state.version = 3;
    state.matches = raw.matches.map((match) => migrateMatch(match as Record<string, unknown>));
    state.outbox = Array.isArray(raw.outbox) ? state.outbox : [];
    state.seen = raw.seen && typeof raw.seen === "object" ? state.seen : {};
    state.lastSuccessAt =
      typeof raw.lastSuccessAt === "string"
        ? raw.lastSuccessAt
        : typeof raw.lastCheckedAt === "string"
          ? raw.lastCheckedAt
          : null;
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState(username, keyword);
    }
    throw error;
  }
}

export async function writeState(
  path: string,
  state: MonitorState,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
