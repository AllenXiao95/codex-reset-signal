import type { ResetEvent } from "./events";

export type XMedia = {
  mediaKey: string;
  type: "photo" | "video" | "animated_gif" | string;
  url: string | null;
  previewImageUrl: string | null;
  altText: string | null;
};

export type XPost = {
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  media: XMedia[];
  canonicalId?: string;
};

export type MatchRecord = {
  version: string;
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  media: XMedia[];
  detectedAt: string;
  events: ResetEvent[];
  notifiedAt?: string;
  channels: string[];
};

export type PendingNotification = {
  key: string;
  post: XPost;
  events: ResetEvent[];
  targets: string[];
  delivered: string[];
};

export type MonitorState = {
  version?: 2;
  eventParserVersion?: number;
  outbox?: PendingNotification[];
  seen?: Record<string, string>;
  latestObservedPost?: XPost | null;
  username: string;
  keyword: string;
  userId: string | null;
  sinceId: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt?: string | null;
  lastRunStatus: string;
  postsScanned: number;
  matches: MatchRecord[];
};

export type PublicSignal = {
  version: string;
  id: string;
  text: string;
  url: string;
  postCreatedAt: string | null;
  detectedAt: string;
  events: ResetEvent[];
  deliveryChannels: string[];
  origin?: "live" | "historical_seed";
};

export type PublicObservedPost = {
  id: string;
  text: string;
  url: string;
  postCreatedAt: string | null;
};

export type PublicStatus = {
  schemaVersion: 1;
  updatedAt: string;
  username: string;
  keyword: string;
  monitor: {
    provider: "fxembed" | "x";
    lastCheckedAt: string | null;
    lastSuccessAt: string | null;
    lastRunStatus: string;
  };
  latestObservedPost: PublicObservedPost | null;
  latest: {
    reset: PublicSignal | null;
    bankCredit: PublicSignal | null;
    bankExpiry: PublicSignal | null;
  };
  recent: PublicSignal[];
};

export type AppConfig = {
  sourceProvider: "fxembed" | "x";
  timezone: string;
  sourceTimezone?: string;
  telegramBotToken?: string;
  telegramChatIds: string[];
  discordWebhookUrls: string[];
  webhookUrls: string[];
  webhookSecret?: string;
  webhookDebug: boolean;
  githubSummaryPath?: string;
  includeMentions: boolean;
  xBearerToken: string;
  username: string;
  keyword: string;
  excludeReplies: boolean;
  bootstrapNotify: boolean;
  statePath: string;
  publicStatusPath?: string;
  resendApiKey?: string;
  emailFrom?: string;
  emailTo: string[];
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFrom?: string;
  smsTo: string[];
};
