import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MatchRecord, MonitorState, XPost } from "./types";

export function emptyState(username: string, keyword: string): MonitorState {
  return {
    version: 2,
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
    latestObservedPost: null,
  };
}

function migrateMatch(match: Record<string, unknown>): MatchRecord {
  const id = String(match.id ?? "");
  const createdAt = typeof match.createdAt === "string" ? match.createdAt : null;
  const notifiedAt =
    typeof match.notifiedAt === "string" ? match.notifiedAt : undefined;
  return {
    version:
      typeof match.version === "string"
        ? match.version
        : `legacy:${id}:${createdAt ?? "unknown"}`,
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

function migrateObservedPost(value: unknown): XPost | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.id !== "string" ||
    !/^\d+$/.test(raw.id) ||
    typeof raw.text !== "string" ||
    typeof raw.url !== "string" ||
    !(raw.createdAt === null || typeof raw.createdAt === "string")
  )
    return null;
  return {
    id: raw.id,
    canonicalId: typeof raw.canonicalId === "string" ? raw.canonicalId : undefined,
    text: raw.text,
    createdAt: raw.createdAt as string | null,
    url: raw.url,
    media: Array.isArray(raw.media) ? (raw.media as XPost["media"]) : [],
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
      (raw.sinceId !== null &&
        raw.sinceId !== undefined &&
        !/^\d+$/.test(String(raw.sinceId)))
    )
      throw new Error("Invalid monitor state; restore a known-good backup");
    if (raw.version !== undefined && raw.version !== 2)
      throw new Error("Unsupported state version");

    const state = raw as unknown as MonitorState;
    state.version = 2;
    state.matches = raw.matches.map((match) =>
      migrateMatch(match as Record<string, unknown>),
    );
    state.outbox = Array.isArray(raw.outbox)
      ? (raw.outbox as MonitorState["outbox"])
      : [];
    state.seen =
      raw.seen && typeof raw.seen === "object"
        ? (raw.seen as Record<string, string>)
        : {};
    state.latestObservedPost = migrateObservedPost(raw.latestObservedPost);
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
