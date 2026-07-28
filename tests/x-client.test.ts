import { describe, expect, it, vi } from "vitest";
import { XClient } from "../src/x-client";

describe("XClient", () => {
  it("maps Note Tweet text and attached media", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "123",
              text: "short",
              note_tweet: { text: "The full reset note" },
              created_at: "2026-07-28T00:00:00.000Z",
              attachments: { media_keys: ["3_photo"] },
            },
          ],
          includes: {
            media: [
              {
                media_key: "3_photo",
                type: "photo",
                url: "https://pbs.twimg.com/example.jpg",
                alt_text: "Diagram",
              },
            ],
          },
          meta: { newest_id: "123" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new XClient("token", fetcher);
    const result = await client.getPosts({
      userId: "42",
      username: "thsottiaux",
    });

    expect(result.newestId).toBe("123");
    expect(result.posts[0]).toMatchObject({
      text: "The full reset note",
      url: "https://x.com/thsottiaux/status/123",
      media: [{ type: "photo", url: "https://pbs.twimg.com/example.jpg" }],
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
