import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  MatchRecord,
  MonitorState,
  PublicObservedPost,
  PublicSignal,
  PublicStatus,
} from "./types";

function toPublicSignal(match: MatchRecord): PublicSignal {
  return {
    version: match.version,
    id: match.id,
    text: match.text,
    url: match.url,
    postCreatedAt: match.createdAt,
    detectedAt: match.detectedAt,
    events: match.events,
    deliveryChannels: match.channels,
  };
}

function toPublicObservedPost(state: MonitorState): PublicObservedPost | null {
  const post = state.latestObservedPost;
  if (!post) return null;
  return {
    id: post.id,
    text: post.text,
    url: post.url,
    postCreatedAt: post.createdAt,
  };
}

function findLatest(
  matches: MatchRecord[],
  type: "reset" | "bank_credit" | "bank_expiry",
): PublicSignal | null {
  const match = matches.find((item) => item.events.some((event) => event.type === type));
  return match ? toPublicSignal(match) : null;
}

export function buildPublicStatus(
  state: MonitorState,
  provider: "fxembed" | "x",
  updatedAt = new Date().toISOString(),
): PublicStatus {
  const matches = state.matches.filter((match) => match.events.length > 0);
  return {
    schemaVersion: 1,
    updatedAt,
    username: state.username,
    keyword: state.keyword,
    monitor: {
      provider,
      lastCheckedAt: state.lastCheckedAt,
      lastSuccessAt: state.lastSuccessAt ?? null,
      lastRunStatus: state.lastRunStatus,
    },
    latestObservedPost: toPublicObservedPost(state),
    latest: {
      reset: findLatest(matches, "reset"),
      bankCredit: findLatest(matches, "bank_credit"),
      bankExpiry: findLatest(matches, "bank_expiry"),
    },
    recent: matches.slice(0, 20).map(toPublicSignal),
  };
}

export async function writePublicStatus(
  path: string,
  status: PublicStatus,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
