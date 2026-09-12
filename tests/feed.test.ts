import { describe, expect, it } from "vitest";
import { renderRssFeed } from "../src/feed";
import type { PublicStatus } from "../src/types";

function statusFixture(): PublicStatus {
  return {
    schemaVersion: 1,
    updatedAt: "2026-09-12T05:00:00.000Z",
    username: "thsottiaux",
    keyword: "reset",
    monitor: {
      provider: "fxembed",
      lastCheckedAt: "2026-09-12T05:00:00.000Z",
      lastSuccessAt: "2026-09-12T05:00:00.000Z",
      lastRunStatus: "checked-1-posts",
    },
    latestObservedPost: null,
    latest: {
      reset: null,
      bankCredit: null,
      bankExpiry: null,
    },
    recent: [
      {
        version: "live-reset",
        id: "100",
        text: "Reset <ready> & landing by midnight.",
        url: "https://x.com/thsottiaux/status/100?a=1&b=2",
        postCreatedAt: "2026-09-12T03:20:36.000Z",
        detectedAt: "2026-09-12T03:22:27.000Z",
        deliveryChannels: [],
        origin: "live",
        events: [
          {
            type: "mention",
            status: "uncertain",
            evidence: "reset discussion",
            time: {
              kind: "unknown",
              start: null,
              end: null,
              evidence: "discussion only",
            },
          },
          {
            type: "reset",
            status: "scheduled",
            evidence: "reset is landing by midnight today",
            time: {
              kind: "exact",
              start: "2026-09-12T07:00:00.000Z",
              end: null,
              evidence: "midnight today",
              note: "Pacific source-timezone assumption",
            },
          },
        ],
      },
      {
        version: "history-bank",
        id: "99",
        text: "Full banked reset today.",
        url: "https://x.com/thsottiaux/status/99",
        postCreatedAt: "2026-09-05T00:39:25.364Z",
        detectedAt: "2026-09-09T08:30:00.000Z",
        deliveryChannels: [],
        origin: "historical_seed",
        events: [
          {
            type: "bank_credit",
            status: "announced",
            evidence: "full banked reset today",
            time: {
              kind: "unknown",
              start: null,
              end: null,
              evidence: "Lands end of day",
            },
          },
        ],
      },
      {
        version: "expiry-only",
        id: "98",
        text: "Bank expires tomorrow.",
        url: "https://x.com/thsottiaux/status/98",
        postCreatedAt: "2026-09-04T00:00:00.000Z",
        detectedAt: "2026-09-04T00:01:00.000Z",
        deliveryChannels: [],
        origin: "live",
        events: [
          {
            type: "bank_expiry",
            status: "scheduled",
            evidence: "expires tomorrow",
            time: {
              kind: "date",
              start: "2026-09-05T00:00:00.000Z",
              end: null,
              evidence: "tomorrow",
            },
          },
        ],
      },
    ],
  };
}

describe("RSS projection", () => {
  it("includes only reset and bank_credit with stable per-event GUIDs", () => {
    const feed = renderRssFeed(statusFixture());

    expect(feed).toContain('<guid isPermaLink="false">100:reset</guid>');
    expect(feed).toContain('<guid isPermaLink="false">99:bank_credit</guid>');
    expect(feed).not.toContain("100:mention");
    expect(feed).not.toContain("98:bank_expiry");
    expect(feed.match(/<item>/g)).toHaveLength(2);
    expect(feed.indexOf("100:reset")).toBeLessThan(feed.indexOf("99:bank_credit"));
  });

  it("escapes XML and uses the source post timestamp instead of detectedAt", () => {
    const feed = renderRssFeed(statusFixture());

    expect(feed).toContain("Reset &lt;ready&gt; &amp; landing by midnight.");
    expect(feed).toContain("https://x.com/thsottiaux/status/100?a=1&amp;b=2");
    expect(feed).toContain("Sat, 12 Sep 2026 03:20:36 GMT");
    expect(feed).not.toContain("2026-09-12T03:22:27.000Z");
  });

  it("keeps logical item identity stable across reprojection metadata changes", () => {
    const before = statusFixture();
    const after = statusFixture();
    after.recent[0].detectedAt = "2026-09-12T06:00:00.000Z";
    after.recent[0].version = "parser-v4";

    const beforeGuid = renderRssFeed(before).match(/<guid isPermaLink="false">([^<]+)<\/guid>/)?.[1];
    const afterGuid = renderRssFeed(after).match(/<guid isPermaLink="false">([^<]+)<\/guid>/)?.[1];

    expect(beforeGuid).toBe("100:reset");
    expect(afterGuid).toBe(beforeGuid);
  });
});
