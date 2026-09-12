import { describe, expect, it } from "vitest";
import { extractEvents } from "../src/events";

const post = (text: string, createdAt = "2026-09-07T19:24:57.000Z") => ({
  id: "1",
  text,
  createdAt,
  url: "https://x.com/thsottiaux/status/1",
  media: [],
});

describe("real announcement regressions", () => {
  it("links a short landing-time sentence to the preceding reset announcement", () => {
    const events = extractEvents(
      post(
        "We will do a global reset of the usage for all paid subscriptions so that you can keep enjoying Astra after burning through all of it doing fun 3D modeling in blender. The work week is about to start. Lands around 6pm PST today.",
      ),
    );
    const reset = events.find((event) => event.type === "reset");
    expect(reset).toBeDefined();
    expect(reset?.status).toBe("scheduled");
    expect(reset?.time.kind).toBe("exact");
    expect(reset?.time.evidence).toMatch(/6pm PST today/i);
    expect(reset?.time.start).not.toBeNull();
  });

  it("treats 'All reset for everyone' as a completed reset", () => {
    const reset = extractEvents(
      post("All reset for everyone. Enjoy the week with Astra.", "2026-09-08T04:05:53.000Z"),
    )[0];
    expect(reset.type).toBe("reset");
    expect(reset.status).toBe("completed");
    expect(reset.time.kind).toBe("observed");
    expect(reset.time.start).toBe("2026-09-08T04:05:53.000Z");
  });

  it("treats the Sep 12 midnight landing announcement as a scheduled reset", () => {
    const text = [
      "Hi Astra users. A reset and a quick update on quality issues that have been posted around.",
      "And of course, a reset is also landing by midnight today.",
    ].join("\n\n");
    const events = extractEvents(
      post(text, "2026-09-12T03:20:36.000Z"),
      "America/Los_Angeles",
    );
    const reset = events.find(
      (event) => event.type === "reset" && event.status === "scheduled",
    );

    expect(reset).toBeDefined();
    expect(reset?.evidence).toMatch(/landing by midnight today/i);
    expect(reset?.time.kind).toBe("exact");
    expect(reset?.time.start).toBe("2026-09-12T07:00:00.000Z");
    expect(reset?.time.note).toMatch(/America\/Los_Angeles/);
  });
});
