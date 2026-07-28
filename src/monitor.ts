import type { AppConfig, MonitorState } from "./types";
import { containsKeyword } from "./matcher";
import { notify } from "./notifications";
import { readState, writeState } from "./state";
import { XClient } from "./x-client";

type Dependencies = {
  xClient?: XClient;
  notifier?: typeof notify;
  now?: () => Date;
};

export async function runMonitor(
  config: AppConfig,
  dependencies: Dependencies = {},
): Promise<MonitorState> {
  const xClient = dependencies.xClient ?? new XClient(config.xBearerToken);
  const notifier = dependencies.notifier ?? notify;
  const now = dependencies.now ?? (() => new Date());
  const state = await readState(config.statePath, config.username, config.keyword);

  const userId =
    state.userId && state.username === config.username
      ? state.userId
      : await xClient.resolveUserId(config.username);
  const { posts, newestId } = await xClient.getPosts({
    userId,
    username: config.username,
    sinceId: state.sinceId,
    excludeReplies: config.excludeReplies,
  });

  const isBootstrap = state.sinceId === null;
  const shouldNotify = !isBootstrap || config.bootstrapNotify;
  const orderedPosts = [...posts].sort((a, b) =>
    BigInt(a.id) < BigInt(b.id) ? -1 : 1,
  );
  const newMatches = [];

  if (shouldNotify) {
    for (const post of orderedPosts) {
      if (!containsKeyword(post.text, config.keyword)) continue;
      const channels = await notifier(config, post);
      newMatches.push({
        ...post,
        notifiedAt: now().toISOString(),
        channels,
      });
    }
  }

  const nextState: MonitorState = {
    username: config.username,
    keyword: config.keyword,
    userId,
    sinceId: newestId ?? state.sinceId,
    lastCheckedAt: now().toISOString(),
    lastRunStatus: isBootstrap
      ? config.bootstrapNotify
        ? "bootstrapped-and-notified"
        : "bootstrapped"
      : `checked-${posts.length}-posts`,
    postsScanned: state.postsScanned + posts.length,
    matches: [...newMatches.reverse(), ...state.matches].slice(0, 20),
  };

  await writeState(config.statePath, nextState);
  return nextState;
}
