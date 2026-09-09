import type { GetPostsOptions, PostSource } from "./post-source";
import type { XMedia, XPost } from "./types";

type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const numericId = (value: unknown): value is string =>
  typeof value === "string" && /^\d+$/.test(value);
const optionalString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

function normalizePost(raw: JsonObject, username: string): XPost {
  // raw_text contains the original Note Tweet text. Do not concatenate quotes,
  // conversation ancestors, author bios, or translated text into the signal.
  const text = object(raw.raw_text) && typeof raw.raw_text.text === "string"
    ? raw.raw_text.text : raw.text;
  if (!numericId(raw.id) || typeof text !== "string")
    throw new Error("Invalid FxEmbed post");
  const timestamp = typeof raw.created_timestamp === "number"
    ? raw.created_timestamp * 1000
    : typeof raw.created_at === "string" ? Date.parse(raw.created_at) : NaN;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()))
    throw new Error("Invalid FxEmbed publication time");
  const media: XMedia[] = [];
  if (raw.media != null) {
    if (!object(raw.media) || (raw.media.all != null && !Array.isArray(raw.media.all)))
      throw new Error("Invalid FxEmbed media");
    for (const [index, item] of ((raw.media.all ?? []) as unknown[]).entries()) {
      if (!object(item) || typeof item.type !== "string")
        throw new Error("Invalid FxEmbed media item");
      media.push({
        mediaKey: optionalString(item.id) ?? `${raw.id}_${index}`,
        type: item.type,
        url: optionalString(item.url),
        previewImageUrl: optionalString(item.thumbnail_url),
        altText: optionalString(item.altText) ?? optionalString(item.alt_text),
      });
    }
  }
  return {
    id: raw.id,
    canonicalId: raw.id,
    text,
    createdAt: date.toISOString(),
    url: `https://x.com/${username}/status/${raw.id}`,
    media,
  };
}

export class FxEmbedClient implements PostSource {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  private async request(url: URL): Promise<JsonObject> {
    let response: Response;
    try {
      response = await this.fetcher(new URL(url), {
        signal: AbortSignal.timeout(20_000),
        redirect: "error",
        headers: { Accept: "application/json", "User-Agent": "codex-reset-signal/1.1" },
      });
    } catch {
      throw new Error("FxEmbed request failed");
    }
    // We deliberately do not use `since`: its 204 optimization only inspects
    // one upstream page. An unexpected 204 is not proof of an empty backlog.
    if (response.status !== 200) throw new Error(`FxEmbed returned HTTP ${response.status}`);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error("Invalid FxEmbed JSON"); }
    if (!object(body) || body.code !== 200 || body.stale === true || body.errors != null)
      throw new Error("FxEmbed returned an unsuccessful or stale response");
    return body;
  }

  async resolveUserId(username: string): Promise<string> {
    const body = await this.request(new URL(
      `https://api.fxtwitter.com/2/profile/${encodeURIComponent(username)}`,
    ));
    if (!object(body.user) || !numericId(body.user.id) ||
        typeof body.user.screen_name !== "string" ||
        body.user.screen_name.toLowerCase() !== username.toLowerCase())
      throw new Error("Invalid FxEmbed user profile");
    return body.user.id;
  }

  async getPosts(options: GetPostsOptions): Promise<{ posts: XPost[]; newestId: string | null }> {
    if (!numericId(options.userId) || (options.sinceId != null && !numericId(options.sinceId)))
      throw new Error("Invalid FxEmbed checkpoint");
    const url = new URL(`https://api.fxtwitter.com/2/profile/id:${options.userId}/statuses`);
    url.searchParams.set("count", "100");
    if (!options.excludeReplies) url.searchParams.set("with_replies", "1");
    const posts = new Map<string, XPost>();
    const cursors = new Set<string>();
    let newestId: string | null = null;
    for (let page = 0; page < 100; page++) {
      const body = await this.request(url);
      if (!Array.isArray(body.results) || !object(body.cursor) ||
          !(body.cursor.bottom == null || typeof body.cursor.bottom === "string"))
        throw new Error("Invalid FxEmbed timeline");
      let pageNewest: string | null = null;
      for (const raw of body.results) {
        if (!object(raw) || raw.type !== "status" || !numericId(raw.id) ||
            !object(raw.author) || !numericId(raw.author.id))
          throw new Error("Invalid FxEmbed timeline entry");
        // Include context authors in the page boundary. An old ancestor or a
        // pinned post alone must never terminate a page containing newer posts.
        if (!pageNewest || BigInt(raw.id) > BigInt(pageNewest)) pageNewest = raw.id;
        if (raw.author.id !== options.userId || raw.reposted_by != null ||
            (options.excludeReplies && raw.replying_to != null)) continue;
        if (options.sinceId && BigInt(raw.id) <= BigInt(options.sinceId)) continue;
        const post = normalizePost(raw, options.username);
        posts.set(post.id, post);
        if (!newestId || BigInt(post.id) > BigInt(newestId)) newestId = post.id;
      }
      const reachedBoundary = options.sinceId && pageNewest &&
        BigInt(pageNewest) <= BigInt(options.sinceId);
      const next = body.cursor.bottom;
      // Return only after the batch is complete; runMonitor commits atomically.
      if (options.bootstrap || reachedBoundary || !next)
        return { posts: [...posts.values()], newestId };
      if (cursors.has(next)) throw new Error("FxEmbed pagination repeated; cursor not advanced");
      cursors.add(next);
      url.searchParams.set("cursor", next);
    }
    throw new Error("FxEmbed pagination limit reached; cursor not advanced");
  }
}
