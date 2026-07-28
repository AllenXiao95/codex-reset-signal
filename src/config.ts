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

export function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  if (!config.xBearerToken) errors.push("X_BEARER_TOKEN is required.");
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

  if (!config.emailTo.length && !config.smsTo.length) {
    errors.push("Configure at least one notification channel (email or SMS).");
  }

  return errors;
}
