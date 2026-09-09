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
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  media: XMedia[];
  notifiedAt: string;
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
  outbox?: PendingNotification[];
  seen?: Record<string, string>;
  username: string;
  keyword: string;
  userId: string | null;
  sinceId: string | null;
  lastCheckedAt: string | null;
  lastRunStatus: string;
  postsScanned: number;
  matches: MatchRecord[];
};

export type AppConfig = {
  timezone: string;
  sourceTimezone?: string;
  telegramBotToken?: string;
  telegramChatIds: string[];
  discordWebhookUrls: string[];
  webhookUrls: string[];
  webhookSecret?: string;
  includeMentions: boolean;
  xBearerToken: string;
  username: string;
  keyword: string;
  excludeReplies: boolean;
  bootstrapNotify: boolean;
  statePath: string;
  resendApiKey?: string;
  emailFrom?: string;
  emailTo: string[];
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFrom?: string;
  smsTo: string[];
};
