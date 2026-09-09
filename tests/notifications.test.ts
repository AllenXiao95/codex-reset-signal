import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTargets, renderEmail } from "../src/notifications";
import { loadConfig, validateConfig } from "../src/config";

describe("renderEmail", () => {
  it("escapes post content and includes media", () => {
    const html = renderEmail(
      {
        id: "1",
        text: "<script>alert('reset')</script>",
        createdAt: null,
        url: "https://x.com/user/status/1",
        media: [
          {
            mediaKey: "m1",
            type: "photo",
            url: "https://example.com/image.jpg",
            previewImageUrl: null,
            altText: null,
          },
        ],
      },
      "user",
      "reset",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("https://example.com/image.jpg");
  });
});

const item = {
  key: "version-123",
  post: {
    id: "1",
    text: "Reset now @everyone",
    createdAt: "2026-09-09T01:00:00Z",
    url: "https://x.com/thsottiaux/status/1",
    media: [],
  },
  events: [],
  targets: [],
  delivered: [],
};
describe("bot transports", () => {
  it("uses plain Telegram text, disables Discord mentions, signs exact webhook bytes", async () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: "123:secret",
      TELEGRAM_CHAT_IDS: "42",
      DISCORD_WEBHOOK_URLS: "https://discord.com/api/webhooks/123/secret",
      WEBHOOK_URLS: "https://example.com/notify",
      WEBHOOK_SECRET: "signing",
    });
    const fetcher = vi
      .fn()
      .mockImplementation(() => Promise.resolve(Response.json({ ok: true })));
    const targets = createTargets(config, fetcher);
    for (const target of targets) await target.send(item);
    const telegram = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(telegram.chat_id).toBe("42");
    expect(telegram.parse_mode).toBeUndefined();
    expect(JSON.parse(fetcher.mock.calls[1][1].body).allowed_mentions).toEqual({
      parse: [],
    });
    const options = fetcher.mock.calls[2][1];
    expect(options.headers["X-Reset-Signature"]).toBe(
      `sha256=${createHmac("sha256", "signing").update(options.body).digest("hex")}`,
    );
    expect(JSON.stringify(targets.map((t) => t.id))).not.toContain("secret");
  });
  it("redacts transport exceptions and rejects Telegram ok:false", async () => {
    const config = loadConfig({
      TELEGRAM_BOT_TOKEN: "123:secret",
      TELEGRAM_CHAT_IDS: "42",
    });
    await expect(
      createTargets(
        config,
        vi.fn().mockRejectedValue(new Error("token=secret")),
      )[0].send(item),
    ).rejects.toThrow("request failed");
    await expect(
      createTargets(
        config,
        vi.fn().mockResolvedValue(Response.json({ ok: false })),
      )[0].send(item),
    ).rejects.toThrow("Telegram rejected");
  });
  it("uses GitHub Actions Job Summary as a built-in target", async () => {
    const dir = await mkdtemp(join(tmpdir(), "reset-signal-summary-"));
    const summaryPath = join(dir, "summary.md");
    try {
      const config = loadConfig({ GITHUB_STEP_SUMMARY: summaryPath });
      expect(validateConfig(config)).toEqual([]);
      const target = createTargets(config).find(
        (candidate) => candidate.channel === "github-actions",
      );
      expect(target).toBeDefined();
      await target!.send(item);
      const summary = await readFile(summaryPath, "utf8");
      expect(summary).toContain("### Reset Signal");
      expect(summary).toContain("Reset now @everyone");
      expect(summary).toContain("version-123");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("validates bot-only configuration, timezones and endpoints", () => {
    const config = loadConfig({
      X_BEARER_TOKEN: "token",
      TELEGRAM_BOT_TOKEN: "123:secret",
      TELEGRAM_CHAT_IDS: "42",
    });
    expect(validateConfig(config)).toEqual([]);
    expect(validateConfig({ ...config, timezone: "invalid" })).toContain(
      "TARGET_TIMEZONE must be an IANA timezone.",
    );
    expect(
      validateConfig({ ...config, webhookUrls: ["http://example.com"] }),
    ).not.toEqual([]);
  });
});
