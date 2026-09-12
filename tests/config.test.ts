import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("source timezone defaults", () => {
  it("defaults @thsottiaux announcements to America/Los_Angeles", () => {
    const config = loadConfig({});
    expect(config.username).toBe("thsottiaux");
    expect(config.sourceTimezone).toBe("America/Los_Angeles");
  });

  it("does not impose the Tibo timezone on other monitored accounts", () => {
    const config = loadConfig({ X_USERNAME: "someone_else" });
    expect(config.sourceTimezone).toBeUndefined();
  });

  it("lets SOURCE_TIMEZONE override the canonical default", () => {
    const config = loadConfig({
      X_USERNAME: "thsottiaux",
      SOURCE_TIMEZONE: "Europe/London",
    });
    expect(config.sourceTimezone).toBe("Europe/London");
  });
});
