import { describe, expect, it } from "vitest";
import { containsKeyword } from "../src/matcher";

describe("containsKeyword", () => {
  it("matches reset as a complete word, case-insensitively", () => {
    expect(containsKeyword("Time to RESET.", "reset")).toBe(true);
    expect(containsKeyword("reset—now", "reset")).toBe(true);
  });

  it("does not match the keyword inside another word", () => {
    expect(containsKeyword("preset and resets", "reset")).toBe(false);
    expect(containsKeyword("reset_button", "reset")).toBe(false);
  });
});
