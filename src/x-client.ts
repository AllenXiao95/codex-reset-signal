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
};

type RawPostsResponse = {
  data?: RawPost[];
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
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        "User-Agent": "reset-signal/1.0",
      },
    });

    const body = (await response.json()) as T & { detail?: string; title?: string };
    if (!response.ok) {
      const message = body.detail || body.title || `X API returned ${response.status}`;
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
  }): Promise<{ posts: XPost[]; newestId: string | null }> {
    const url = new URL(`https://api.x.com/2/users/${options.userId}/tweets`);
    url.searchParams.set("max_results", "100");
    url.searchParams.set(
      "tweet.fields",
      "attachments,created_at,note_tweet,text",
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

    const body = await this.request<RawPostsResponse>(url);
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

    const posts = (body.data ?? []).map((post): XPost => ({
      id: post.id,
      text: post.note_tweet?.text || post.text,
      createdAt: post.created_at ?? null,
      url: `https://x.com/${options.username}/status/${post.id}`,
      media: (post.attachments?.media_keys ?? [])
        .map((key) => mediaByKey.get(key))
        .filter((item): item is XMedia => Boolean(item)),
    }));

    const newestId =
      body.meta?.newest_id ??
      posts.reduce<string | null>(
        (latest, post) =>
          latest === null || BigInt(post.id) > BigInt(latest) ? post.id : latest,
        null,
      );

    return { posts, newestId };
  }
}
