import { describe, expect, it } from "vitest";
import { extractEvents, formatTime, parseEventTime } from "../src/events";
const post = (text: string, date = "2026-09-09T01:00:00Z") => ({
  id: "1",
  text,
  createdAt: date,
  url: "https://x.com/thsottiaux/status/1",
  media: [],
});
describe("event and time semantics", () => {
  it("anchors relative time to publication and converts across dates", () => {
    const time = parseEventTime("reset in two hours", "2026-09-09T23:00:00Z");
    expect(time.start).toBe("2026-09-10T01:00:00.000Z");
    expect(formatTime(time, "Asia/Shanghai")).toContain(
      "2026-09-10 09:00 +08:00",
    );
  });
  it.each([
    "within the next hour",
    "in the next hour",
    "within an hour",
    "over the next one hour",
  ])("keeps %s a window", (phrase) => {
    expect(
      parseEventTime(`reset ${phrase}`, "2026-09-09T01:00:00Z"),
    ).toMatchObject({
      kind: "window",
      start: "2026-09-09T01:00:00.000Z",
      end: "2026-09-09T02:00:00.000Z",
    });
  });
  it.each([
    ["January 10", "2026-01-11T01:00:00.000Z"],
    ["September 10", "2026-09-11T00:00:00.000Z"],
  ])("applies Pacific DST for %s", (date, expected) => {
    expect(
      parseEventTime(`reset ${date}, 2026 at 5pm PT`, "2026-01-01T00:00:00Z")
        .start,
    ).toBe(expected);
  });
  it("does not invent a source timezone", () => {
    expect(
      parseEventTime("reset tomorrow at 5pm", "2026-09-09T01:00:00Z").kind,
    ).toBe("unknown");
    expect(
      parseEventTime(
        "reset tomorrow at 5pm",
        "2026-09-09T01:00:00Z",
        "America/Los_Angeles",
      ).note,
    ).toContain("假设");
  });
  it("does not invent a time for dates, soon or missing publication", () => {
    expect(
      parseEventTime("reset September 10 PT", "2026-09-09T01:00:00Z").kind,
    ).toBe("date");
    expect(parseEventTime("reset soon", "2026-09-09T01:00:00Z").kind).toBe(
      "unknown",
    );
    expect(parseEventTime("reset in two hours", null).kind).toBe("unknown");
  });
  it("rejects DST gaps and ambiguous clocks", () => {
    expect(
      parseEventTime("reset March 8 at 2:30am PT", "2026-03-01T00:00:00Z").kind,
    ).toBe("unknown");
    expect(
      parseEventTime("reset November 1 at 1:30am PT", "2026-10-30T00:00:00Z")
        .kind,
    ).toBe("unknown");
  });
  it("separates reset timing, bank credit and validity", () => {
    const events = extractEvents(
      post(
        "Codex usage limits will be fully reset again in the next hour and we will credit one additional reset into your bank for your own usage over the next 24 hours.",
      ),
    );
    expect(events.map((e) => e.type)).toEqual([
      "reset",
      "bank_credit",
      "bank_expiry",
    ]);
    expect(events[0].time.kind).toBe("window");
    expect(events[1].time.kind).toBe("unknown");
    expect(events[2].time.start).toBeNull();
  });
  it("does not claim a request or denial is a reset", () => {
    expect(extractEvents(post("Please reset Codex?"))[0].type).toBe("mention");
    expect(
      extractEvents(post("We will not reset Codex tomorrow."))[0].type,
    ).toBe("mention");
    expect(extractEvents(post("Reset your password."))).toEqual([]);
  });
  it("labels completion timestamps as observations", () => {
    const e = extractEvents(post("We have reset Codex limits."))[0];
    expect(e.status).toBe("completed");
    expect(e.time.kind).toBe("observed");
  });
});

describe("reset assertion state", () => {
  it.each([
    "Reset all propagated.",
    "All reset for everyone.",
    "The reset is complete.",
    "The reset has propagated.",
    "Reset fully applied.",
  ])("classifies strong completion: %s", (text) => {
    expect(extractEvents(post(text))[0]).toMatchObject({
      type: "reset",
      status: "completed",
      time: { kind: "observed" },
    });
  });

  it.each([
    "Will there be a reset?",
    "Reset should be propagated now.",
    "Reset is not fully propagated.",
    "Maybe we reset tonight.",
    "There is no schedule, only resets.",
  ])("keeps weak, negative or hypothetical assertions uncertain: %s", (text) => {
    expect(extractEvents(post(text))[0]).toMatchObject({
      type: "mention",
      status: "uncertain",
    });
  });

  it("marks a future commitment without reliable time as announced", () => {
    expect(extractEvents(post("We will do another reset."))[0]).toMatchObject({
      type: "reset",
      status: "announced",
      time: { kind: "unknown" },
    });
  });

  it("marks a future commitment with reliable time as scheduled", () => {
    expect(
      extractEvents(
        post("Reset will land by midnight today.", "2026-09-12T03:20:36.000Z"),
        "America/Los_Angeles",
      )[0],
    ).toMatchObject({
      type: "reset",
      status: "scheduled",
      time: { kind: "exact", start: "2026-09-12T07:00:00.000Z" },
    });
  });

  it("does not let a parsed date create an actionable reset", () => {
    expect(
      extractEvents(
        post("The occasional reset was discussed on September 10."),
        "America/Los_Angeles",
      )[0],
    ).toMatchObject({ type: "mention", status: "uncertain" });
  });
});

it("keeps competing relative times uncertain", () => {
  expect(
    parseEventTime("reset in one hour or in two hours", "2026-09-09T01:00:00Z")
      .kind,
  ).toBe("unknown");
});
it("accepts explicit UTC clock times", () => {
  expect(
    parseEventTime(
      "reset September 10, 2026 at 17:00 UTC",
      "2026-09-09T01:00:00Z",
    ).start,
  ).toBe("2026-09-10T17:00:00.000Z");
});
