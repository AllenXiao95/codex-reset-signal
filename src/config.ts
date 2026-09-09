import { IANAZone } from "luxon";
import type { AppConfig } from "./types";

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    timezone: env.TARGET_TIMEZONE?.trim() || "Asia/Shanghai",
    sourceTimezone: env.SOURCE_TIMEZONE?.trim() || undefined,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim(),
    telegramChatIds: splitList(env.TELEGRAM_CHAT_IDS),
    discordWebhookUrls: splitList(env.DISCORD_WEBHOOK_URLS),
    webhookUrls: splitList(env.WEBHOOK_URLS),
    webhookSecret: env.WEBHOOK_SECRET?.trim(),
    includeMentions: toBoolean(env.INCLUDE_MENTIONS, true),
    xBearerToken: env.X_BEARER_TOKEN?.trim() ?? "",
    username: env.X_USERNAME?.trim().replace(/^@/, "") || "thsottiaux",
    keyword: env.MATCH_WORD?.trim() || "reset",
    excludeReplies: toBoolean(env.X_EXCLUDE_REPLIES),
    bootstrapNotify: toBoolean(env.BOOTSTRAP_NOTIFY),
    statePath: env.STATE_PATH?.trim() || "data/state.json",
    resendApiKey: env.RESEND_API_KEY?.trim(),
    emailFrom: env.EMAIL_FROM?.trim(),
    emailTo: splitList(env.EMAIL_TO),
    twilioAccountSid: env.TWILIO_ACCOUNT_SID?.trim(),
    twilioAuthToken: env.TWILIO_AUTH_TOKEN?.trim(),
    twilioFrom: env.TWILIO_FROM?.trim(),
    smsTo: splitList(env.SMS_TO),
  };
}

export function validateConfig(
  config: AppConfig,
  options: { offline?: boolean } = {},
): string[] {
  const errors: string[] = [];

  if (!options.offline && !config.xBearerToken)
    errors.push("X_BEARER_TOKEN is required.");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(config.username)) {
    errors.push("X_USERNAME must be a valid X handle.");
  }

  const emailPartiallyConfigured =
    Boolean(config.resendApiKey || config.emailFrom || config.emailTo.length) &&
    !(config.resendApiKey && config.emailFrom && config.emailTo.length);
  if (emailPartiallyConfigured) {
    errors.push("Email requires RESEND_API_KEY, EMAIL_FROM, and EMAIL_TO.");
  }

  const smsPartiallyConfigured =
    Boolean(
      config.twilioAccountSid ||
        config.twilioAuthToken ||
        config.twilioFrom ||
        config.smsTo.length,
    ) &&
    !(
      config.twilioAccountSid &&
      config.twilioAuthToken &&
      config.twilioFrom &&
      config.smsTo.length
    );
  if (smsPartiallyConfigured) {
    errors.push(
      "SMS requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, and SMS_TO.",
    );
  }

  if (!IANAZone.isValidZone(config.timezone))
    errors.push("TARGET_TIMEZONE must be an IANA timezone.");
  if (config.sourceTimezone && !IANAZone.isValidZone(config.sourceTimezone))
    errors.push("SOURCE_TIMEZONE must be an IANA timezone.");
  if (
    Boolean(config.telegramBotToken) !== Boolean(config.telegramChatIds.length)
  )
    errors.push("Telegram requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_IDS.");
  for (const raw of [...config.discordWebhookUrls, ...config.webhookUrls]) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error();
      if (
        config.discordWebhookUrls.includes(raw) &&
        (!/^(?:canary\.|ptb\.)?discord(?:app)?\.com$/.test(url.hostname) ||
          !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(url.pathname))
      )
        throw new Error();
    } catch {
      errors.push(
        "Webhook URLs must be HTTPS; Discord URLs must be valid Discord webhook endpoints.",
      );
    }
  }
  if (
    !options.offline &&
    !config.emailTo.length &&
    !config.smsTo.length &&
    !config.telegramChatIds.length &&
    !config.discordWebhookUrls.length &&
    !config.webhookUrls.length
  ) {
    errors.push(
      "Configure at least one notification channel (email, SMS, Telegram, Discord, or webhook).",
    );
  }

  return errors;
}
