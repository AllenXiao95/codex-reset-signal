import { describe, expect, it } from "vitest";
import { buildPublicStatus } from "../src/public-status";
import { emptyState } from "../src/state";

describe("public status projection", () => {
  it("publishes detected reset events independently of delivery", () => {
    const state = emptyState("thsottiaux", "reset");
    state.lastCheckedAt = "2026-09-09T03:00:00Z";
    state.lastSuccessAt = "2026-09-09T03:00:00Z";
    state.lastRunStatus = "failed-1";
    state.matches = [
      {
        version: "v1",
        id: "2",
        text: "Codex will reset in two hours.",
        createdAt: "2026-09-09T01:00:00Z",
        url: "https://x.com/thsottiaux/status/2",
        media: [],
        detectedAt: "2026-09-09T03:00:00Z",
        channels: [],
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
    expect(status.latest.reset?.id).toBe("2");
    expect(status.latest.reset?.deliveryChannels).toEqual([]);
    expect(status.latest.reset?.events[0].time.start).toBe(
      "2026-09-09T03:00:00Z",
    );
    expect(status.monitor.lastRunStatus).toBe("failed-1");
  });
});
