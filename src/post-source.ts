import type { AppConfig, XPost } from "./types";
import { FxEmbedClient } from "./fxembed-client";
import { XClient } from "./x-client";

export type GetPostsOptions = {
  userId: string;
  username: string;
  sinceId?: string | null;
  excludeReplies?: boolean;
  bootstrap?: boolean;
};

export interface PostSource {
  resolveUserId(username: string): Promise<string>;
  getPosts(options: GetPostsOptions): Promise<{
    posts: XPost[];
    newestId: string | null;
    latestObservedPost?: XPost | null;
  }>;
}

export function createPostSource(config: AppConfig): PostSource {
  // Never fall back to a paid source, even if a token is present.
  switch (config.sourceProvider) {
    case "fxembed": return new FxEmbedClient();
    case "x": return new XClient(config.xBearerToken);
    default: throw new Error("Unsupported SOURCE_PROVIDER");
  }
}
