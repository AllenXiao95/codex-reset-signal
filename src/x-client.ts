import type { XMedia, XPost } from "./types";

type RawUserResponse = {
  data?: { id: string; username: string };
  detail?: string;
  title?: string;
};

type RawMedia = {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
  alt_text?: string;
};

type RawPost = {
  id: string;
  text: string;
  created_at?: string;
  attachments?: { media_keys?: string[] };
  note_tweet?: { text?: string };
  edit_history_tweet_ids?: string[];
  author_id?: string;
};

type RawPostsResponse = {
  data?: RawPost[];
  errors?: unknown[];
  includes?: { media?: RawMedia[] };
  meta?: { newest_id?: string; next_token?: string; result_count?: number };
  detail?: string;
  title?: string;
};

export class XClient {
  constructor(
    private readonly bearerToken: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async request<T>(url: URL): Promise<T> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        "User-Agent": "reset-signal/1.0",
      },
    });

    const body = (await response.json()) as T & {
      detail?: string;
      title?: string;
    };
    if (!response.ok) {
      const message = `X API returned ${response.status}`;
      throw new Error(message);
    }
    return body;
  }

  async resolveUserId(username: string): Promise<string> {
    const url = new URL(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`,
    );
    const body = await this.request<RawUserResponse>(url);
    if (!body.data?.id) throw new Error(`X user @${username} was not found.`);
    return body.data.id;
  }

  async getPosts(options: {
    userId: string;
    username: string;
    sinceId?: string | null;
    excludeReplies?: boolean;
    bootstrap?: boolean;
  }): Promise<{ posts: XPost[]; newestId: string | null }> {
    const url = new URL(`https://api.x.com/2/users/${options.userId}/tweets`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set(
      "tweet.fields",
      "attachments,created_at,note_tweet,text,author_id,edit_history_tweet_ids",
    );
    url.searchParams.set("expansions", "attachments.media_keys");
    url.searchParams.set(
      "media.fields",
      "media_key,type,url,preview_image_url,alt_text",
    );
    url.searchParams.set(
      "exclude",
      options.excludeReplies ? "retweets,replies" : "retweets",
    );
    if (options.sinceId) url.searchParams.set("since_id", options.sinceId);

    const allPosts = new Map<string, XPost>();
    const tokens = new Set<string>();
    let latest: string | null = null;
    do {
      const body = await this.request<RawPostsResponse>(url);
      if (body.errors?.length)
        throw new Error(
          "X timeline returned partial errors; cursor not advanced",
        );
      if (!Array.isArray(body.data) && body.meta?.result_count !== 0)
        throw new Error("Invalid X timeline response");
      const mediaByKey = new Map<string, XMedia>();
      for (const item of body.includes?.media ?? []) {
        mediaByKey.set(item.media_key, {
          mediaKey: item.media_key,
          type: item.type,
          url: item.url ?? null,
          previewImageUrl: item.preview_image_url ?? null,
          altText: item.alt_text ?? null,
        });
      }

      const posts = (body.data ?? [])
        .filter((post) => !post.author_id || post.author_id === options.userId)
        .map(
          (post): XPost => ({
            canonicalId: post.edit_history_tweet_ids?.[0] ?? post.id,
            id: post.id,
            text: post.note_tweet?.text || post.text,
            createdAt: post.created_at ?? null,
            url: `https://x.com/${options.username}/status/${post.id}`,
            media: (post.attachments?.media_keys ?? [])
              .map((key) => mediaByKey.get(key))
              .filter((item): item is XMedia => Boolean(item)),
          }),
        );

      for (const post of posts) {
        if (!/^\d+$/.test(post.id)) throw new Error("Invalid X post ID");
        allPosts.set(post.id, post);
        if (!latest || BigInt(post.id) > BigInt(latest)) latest = post.id;
      }
      // First run only establishes a baseline; later runs drain the entire backlog.
      if (options.bootstrap || !body.meta?.next_token) break;
      if (tokens.has(body.meta.next_token) || tokens.size >= 100)
        throw new Error("X pagination incomplete; cursor not advanced");
      tokens.add(body.meta.next_token);
      url.searchParams.set("pagination_token", body.meta.next_token);
    } while (true);
    return { posts: [...allPosts.values()], newestId: latest };
  }
}
