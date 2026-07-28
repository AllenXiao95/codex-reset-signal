import { describe, expect, it } from "vitest";
import { renderEmail } from "../src/notifications";

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
