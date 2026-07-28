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

export type MonitorState = {
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
