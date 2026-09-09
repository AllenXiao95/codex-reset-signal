import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { historicalSignals } from "./history";
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
    origin: "live",
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

function mergeSignals(matches: MatchRecord[]): PublicSignal[] {
  const byId = new Map<string, PublicSignal>();
  for (const signal of historicalSignals()) byId.set(signal.id, signal);
  for (const match of matches) byId.set(match.id, toPublicSignal(match));
  return [...byId.values()].sort((a, b) => {
    if (/^\d+$/.test(a.id) && /^\d+$/.test(b.id)) {
      const left = BigInt(a.id);
      const right = BigInt(b.id);
      if (left !== right) return left > right ? -1 : 1;
    }
    const leftTime = a.postCreatedAt ? Date.parse(a.postCreatedAt) : 0;
    const rightTime = b.postCreatedAt ? Date.parse(b.postCreatedAt) : 0;
    return rightTime - leftTime;
  });
}

function findLatest(
  signals: PublicSignal[],
  type: "reset" | "bank_credit" | "bank_expiry",
): PublicSignal | null {
  return signals.find((item) => item.events.some((event) => event.type === type)) ?? null;
}

export function buildPublicStatus(
  state: MonitorState,
  provider: "fxembed" | "x",
  updatedAt = new Date().toISOString(),
): PublicStatus {
  const matches = state.matches.filter((match) => match.events.length > 0);
  const signals = mergeSignals(matches);
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
      reset: findLatest(signals, "reset"),
      bankCredit: findLatest(signals, "bank_credit"),
      bankExpiry: findLatest(signals, "bank_expiry"),
    },
    recent: signals.slice(0, 20),
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
