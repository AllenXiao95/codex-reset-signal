import type { AppConfig, XPost } from "./types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmail(post: XPost, username: string, keyword: string): string {
  const media = post.media
    .map((item) => item.url || item.previewImageUrl)
    .filter((url): url is string => Boolean(url))
    .map(
      (url) =>
        `<img src="${escapeHtml(url)}" alt="Post media" style="display:block;width:100%;max-width:640px;border-radius:16px;margin:16px 0;" />`,
    )
    .join("");

  return `<!doctype html>
<html><body style="margin:0;background:#f5f2ea;color:#181817;font-family:Arial,sans-serif">
<div style="max-width:680px;margin:0 auto;padding:32px 20px">
  <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#68665f">Reset Signal · @${escapeHtml(username)}</div>
  <h1 style="font-size:32px;line-height:1.08;margin:16px 0">“${escapeHtml(keyword)}” detected.</h1>
  <div style="background:#fff;border:1px solid #dedbd2;border-radius:20px;padding:24px">
    <p style="font-size:18px;line-height:1.6;white-space:pre-wrap;margin-top:0">${escapeHtml(post.text)}</p>
    ${media}
    <a href="${escapeHtml(post.url)}" style="display:inline-block;background:#ff4f32;color:#fff;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:700">Open on X →</a>
  </div>
  <p style="font-size:12px;color:#77736b;margin-top:18px">Post ID ${escapeHtml(post.id)} · sent once by Reset Signal</p>
</div></body></html>`;
}

async function sendEmail(
  config: AppConfig,
  post: XPost,
  fetcher: typeof fetch,
): Promise<void> {
  if (!config.resendApiKey || !config.emailFrom || !config.emailTo.length) return;

  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `reset-signal-${post.id}`,
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: config.emailTo,
      subject: `Reset Signal: @${config.username} mentioned “${config.keyword}”`,
      html: renderEmail(post, config.username, config.keyword),
      text: `${post.text}\n\n${post.url}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend failed (${response.status}): ${await response.text()}`);
  }
}

async function sendSms(
  config: AppConfig,
  post: XPost,
  fetcher: typeof fetch,
): Promise<void> {
  if (
    !config.twilioAccountSid ||
    !config.twilioAuthToken ||
    !config.twilioFrom ||
    !config.smsTo.length
  ) {
    return;
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    config.twilioAccountSid,
  )}/Messages.json`;
  const auth = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
  ).toString("base64");
  const excerpt = post.text.length > 180 ? `${post.text.slice(0, 177)}…` : post.text;

  for (const recipient of config.smsTo) {
    const body = new URLSearchParams({
      To: recipient,
      From: config.twilioFrom,
      Body: `Reset Signal — @${config.username}: ${excerpt}\n${post.url}`,
    });
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Twilio failed (${response.status}): ${await response.text()}`);
    }
  }
}

export async function notify(
  config: AppConfig,
  post: XPost,
  fetcher: typeof fetch = fetch,
): Promise<string[]> {
  const channels: string[] = [];
  if (config.emailTo.length) {
    await sendEmail(config, post, fetcher);
    channels.push("email");
  }
  if (config.smsTo.length) {
    await sendSms(config, post, fetcher);
    channels.push("sms");
  }
  return channels;
}
