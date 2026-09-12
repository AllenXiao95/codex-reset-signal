import { describe, expect, it } from "vitest";
import { buildPublicStatus } from "../src/public-status";
import { emptyState } from "../src/state";

describe("public status projection", () => {
  it("publishes detected reset events independently of delivery", () => {
    const state = emptyState("thsottiaux", "reset");
    state.lastCheckedAt = "2026-09-09T03:00:00Z";
    state.lastSuccessAt = "2026-09-09T03:00:00Z";
    state.lastRunStatus = "failed-1";
    state.latestObservedPost = {
      id: "2098000000000000000",
      text: "Astra demand is unprecedented.",
      createdAt: "2026-09-09T02:30:00Z",
      url: "https://x.com/thsottiaux/status/2098000000000000000",
      media: [],
    };
    state.matches = [
      {
        version: "v1",
        id: "2097000000000000000",
        text: "Codex will reset in two hours.",
        createdAt: "2026-09-09T01:00:00Z",
        url: "https://x.com/thsottiaux/status/2097000000000000000",
        media: [],
        detectedAt: "2026-09-09T03:00:00Z",
        channels: ["github-actions", "email"],
        events: [
          {
            type: "reset",
            status: "scheduled",
            evidence: "reset in two hours",
            time: {
              kind: "exact",
              start: "2026-09-09T03:00:00Z",
              end: null,
              evidence: "in two hours",
            },
          },
        ],
      },
    ];

    const status = buildPublicStatus(
      state,
      "fxembed",
      "2026-09-09T03:00:01Z",
    );
    expect(status.latest.reset?.id).toBe("2097000000000000000");
    expect(status.latest.reset?.origin).toBe("live");
    expect(status.latest.reset?.deliveryChannels).toEqual(["email"]);
    expect(status.latest.reset?.events[0].time.start).toBe(
      "2026-09-09T03:00:00Z",
    );
    expect(status.latestObservedPost?.id).toBe("2098000000000000000");
    expect(status.recent.map((item) => item.id)).toEqual([
      "2097000000000000000",
      "2096035437299237298",
    ]);
    expect(status.monitor.lastRunStatus).toBe("failed-1");
  });

  it("fills the previous verified banked reset without mutating live state", () => {
    const state = emptyState("thsottiaux", "reset");
    const status = buildPublicStatus(state, "fxembed");

    expect(state.matches).toEqual([]);
    expect(state.sinceId).toBeNull();
    expect(state.outbox).toEqual([]);
    expect(status.latest.bankCredit).toMatchObject({
      id: "2096035437299237298",
      origin: "historical_seed",
      postCreatedAt: "2026-09-05T00:39:25.364Z",
      deliveryChannels: [],
    });
    expect(status.latest.bankCredit?.events[0]).toMatchObject({
      type: "bank_credit",
      status: "announced",
      time: { kind: "unknown", start: null },
    });
  });

  it("does not inject Tibo history into a fork targeting another account", () => {
    const state = emptyState("someone_else", "reset");
    const status = buildPublicStatus(state, "fxembed");
    expect(status.latest.bankCredit).toBeNull();
    expect(status.recent).toEqual([]);
  });
});
