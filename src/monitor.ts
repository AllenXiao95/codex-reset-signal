import { createHash } from "node:crypto";
import { mkdir, open, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig, MonitorState, XPost } from "./types";
import { extractEvents } from "./events";
import { containsKeyword } from "./matcher";
import { createTargets, type NotificationTarget } from "./notifications";
import { readState, writeState } from "./state";
import { createPostSource, type PostSource } from "./post-source";

type Dependencies = {
  source?: PostSource;
  /** @deprecated Use source. Kept for existing integrations. */
  xClient?: PostSource;
  targets?: NotificationTarget[];
  now?: () => Date;
};
export const postVersion = (post: XPost) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        post.canonicalId ?? post.id,
        post.text,
        post.createdAt,
        post.media,
      ]),
    )
    .digest("hex");

export async function runMonitor(
  config: AppConfig,
  deps: Dependencies = {},
): Promise<MonitorState> {
  await mkdir(dirname(config.statePath), { recursive: true });
  const lockPath = `${config.statePath}.lock`;
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "Monitor state is locked; stop any active worker before removing a stale .lock file",
      );
    throw error;
  }
  try {
    return await runLocked(config, deps);
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
async function runLocked(
  config: AppConfig,
  deps: Dependencies,
): Promise<MonitorState> {
  const state = await readState(
    config.statePath,
    config.username,
    config.keyword,
  );
  const client = deps.source ?? deps.xClient ?? createPostSource(config);
  const targets = deps.targets ?? createTargets(config);
  if (!targets.length) throw new Error("No notification targets configured");
  const now = deps.now ?? (() => new Date());
  state.version = 2;
  state.outbox ??= [];
  state.seen ??= {};
  const errors: string[] = [];
  let fetched: { posts: XPost[]; newestId: string | null } | undefined;
  const bootstrap = state.sinceId === null;
  try {
    state.userId ??= await client.resolveUserId(config.username);
    fetched = await client.getPosts({
      userId: state.userId,
      username: config.username,
      sinceId: state.sinceId,
      excludeReplies: config.excludeReplies,
      bootstrap,
    });
  } catch {
    errors.push(`${config.sourceProvider} collection failed; cursor not advanced`);
  }
  if (fetched) {
    const { posts, newestId } = fetched;
    for (const post of [...posts].sort((a, b) =>
      BigInt(a.id) < BigInt(b.id) ? -1 : 1,
    )) {
      const identity = post.canonicalId ?? post.id;
      const version = postVersion(post);
      if (state.seen[identity] === version) continue;
      state.seen[identity] = version;
      if (bootstrap && !config.bootstrapNotify) continue;
      const events =
        config.keyword.toLowerCase() === "reset"
          ? extractEvents(post, config.sourceTimezone).filter(
              (e) => config.includeMentions || e.type !== "mention",
            )
          : containsKeyword(post.text, config.keyword)
            ? [
                {
                  type: "mention" as const,
                  status: "uncertain" as const,
                  evidence: post.text,
                  time: {
                    kind: "unknown" as const,
                    start: null,
                    end: null,
                    evidence: post.text,
                  },
                },
              ]
            : [];
      if (events.length && !state.outbox.some((item) => item.key === version))
        state.outbox.push({
          key: version,
          post,
          events,
          targets: targets.map((t) => t.id),
          delivered: [],
        });
    }
    state.sinceId =
      newestId && (!state.sinceId || BigInt(newestId) > BigInt(state.sinceId))
        ? newestId
        : state.sinceId;
    state.postsScanned += posts.length;
    state.lastCheckedAt = now().toISOString();
    state.lastRunStatus = bootstrap
      ? "bootstrapped"
      : `checked-${posts.length}-posts`;
    // Cursor and durable outbox are committed together, before any outbound call.
    await writeState(config.statePath, state);
  }

  // Deliver existing pending items even when X is temporarily unavailable.
  for (const item of [...state.outbox]) {
    for (const targetId of item.targets) {
      if (item.delivered.includes(targetId)) continue;
      const target = targets.find((t) => t.id === targetId);
      if (!target) {
        errors.push(
          "Pending target is no longer configured; restore its configuration or explicitly remove its pending delivery",
        );
        continue;
      }
      try {
        await target.send(item);
      } catch {
        errors.push(
          `${target.channel} delivery failed; will retry on next run`,
        );
        continue;
      }
      item.delivered.push(targetId);
      // A failed checkpoint must stop the run, not send subsequent notifications.
      await writeState(config.statePath, state);
    }
    if (item.targets.every((id) => item.delivered.includes(id))) {
      state.matches = [
        {
          ...item.post,
          notifiedAt: now().toISOString(),
          channels: item.targets.map((id) => id.split(":")[0]),
        },
        ...state.matches,
      ].slice(0, 20);
      state.outbox = state.outbox.filter((p) => p.key !== item.key);
      await writeState(config.statePath, state);
    }
  }
  state.seen = Object.fromEntries(Object.entries(state.seen).slice(-2000));
  if (errors.length) state.lastRunStatus = `failed-${errors.length}`;
  await writeState(config.statePath, state);
  if (errors.length) throw new Error([...new Set(errors)].join("; "));
  return state;
}
