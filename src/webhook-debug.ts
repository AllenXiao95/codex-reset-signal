import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadConfig, validateConfig } from "./config";
import { extractEvents } from "./events";
import { createTargets } from "./notifications";
import type { PendingNotification, XPost } from "./types";

if (existsSync(".env")) process.loadEnvFile(".env");

const config = loadConfig();
const errors = validateConfig(config, { offline: true });
if (errors.length) throw new Error(errors.join("\n"));
if (!config.webhookUrls.length)
  throw new Error("Set WEBHOOK_URLS to at least one HTTPS endpoint before running webhook:debug.");

const inputIndex = process.argv.indexOf("--input");
const input =
  inputIndex >= 0
    ? process.argv[inputIndex + 1]
    : new URL("../fixtures/posts.json", import.meta.url);
if (!input) throw new Error("--input requires a JSON file path");

const posts = JSON.parse(await readFile(input, "utf8")) as XPost[];
const post = posts.find((candidate) => extractEvents(candidate, config.sourceTimezone).length) ?? posts[0];
if (!post) throw new Error("Webhook debug input contains no posts.");

const item: PendingNotification = {
  key: `debug-${createHash("sha256").update(JSON.stringify(post)).digest("hex")}`,
  post,
  events: extractEvents(post, config.sourceTimezone),
  targets: [],
  delivered: [],
};

const webhookOnlyConfig = {
  ...config,
  webhookDebug: true,
  githubSummaryPath: undefined,
  telegramBotToken: undefined,
  telegramChatIds: [],
  discordWebhookUrls: [],
  resendApiKey: undefined,
  emailFrom: undefined,
  emailTo: [],
  twilioAccountSid: undefined,
  twilioAuthToken: undefined,
  twilioFrom: undefined,
  smsTo: [],
};
const targets = createTargets(webhookOnlyConfig).filter(
  (target) => target.channel === "webhook",
);

for (const target of targets) await target.send(item);
console.log(`Webhook debug delivery completed for ${targets.length} endpoint(s).`);
