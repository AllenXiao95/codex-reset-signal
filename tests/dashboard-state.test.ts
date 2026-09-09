import { describe, expect, it } from "vitest";
import { isCompletedReset, resetHeroState } from "../src/dashboard-state";
import type { ResetEvent } from "../src/events";

const event = (overrides: Partial<ResetEvent> = {}): ResetEvent => ({
  type: "reset",
  status: "announced",
  evidence: "Reset signal",
  time: {
    kind: "unknown",
    start: null,
    end: null,
    evidence: "Reset signal",
  },
  ...overrides,
});

describe("dashboard reset presentation", () => {
  it("shows countdown only for a future exact or window schedule", () => {
    const scheduled = event({
      status: "scheduled",
      time: {
        kind: "exact",
        start: "2026-09-09T12:00:00Z",
        end: null,
        evidence: "at noon",
      },
    });
    expect(resetHeroState(scheduled, Date.parse("2026-09-09T11:00:00Z"))).toEqual({
      kicker: "NEXT RESET",
      status: "Reset scheduled",
      showPlannedTime: true,
      showCountdown: true,
    });
  });

  it("shows a planned date without inventing a countdown", () => {
    const scheduled = event({
      status: "scheduled",
      time: {
        kind: "date",
        start: "2026-09-10T00:00:00Z",
        end: "2026-09-11T00:00:00Z",
        evidence: "tomorrow",
      },
    });
    expect(resetHeroState(scheduled, Date.parse("2026-09-09T11:00:00Z"))).toMatchObject({
      kicker: "NEXT RESET",
      showPlannedTime: true,
      showCountdown: false,
    });
  });

  it("does not display observed publication time as a completed reset time", () => {
    const completed = event({
      status: "completed",
      time: {
        kind: "observed",
        start: "2026-09-08T04:05:53Z",
        end: null,
        evidence: "All reset for everyone",
      },
    });
    expect(resetHeroState(completed, Date.parse("2026-09-09T11:00:00Z"))).toEqual({
      kicker: "LATEST RESET",
      status: "Reset completed",
      showPlannedTime: false,
      showCountdown: false,
    });
    expect(isCompletedReset(completed)).toBe(true);
  });

  it("marks an expired schedule as awaiting confirmation", () => {
    const scheduled = event({
      status: "scheduled",
      time: {
        kind: "exact",
        start: "2026-09-08T02:00:00Z",
        end: null,
        evidence: "6pm PST today",
      },
    });
    expect(resetHeroState(scheduled, Date.parse("2026-09-09T11:00:00Z"))).toMatchObject({
      kicker: "LATEST RESET",
      status: "Reset expected · awaiting confirmation",
      showPlannedTime: false,
      showCountdown: false,
    });
  });
});
