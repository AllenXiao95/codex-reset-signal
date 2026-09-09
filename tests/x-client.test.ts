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

describe("pagination", () => {
  it("drains all pages using the same since_id and preserves the highest ID", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "10", text: "reset" }],
          meta: { next_token: "page2" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "3", text: "reset" }], meta: {} }),
      );
    const result = await new XClient("secret", fetcher).getPosts({
      userId: "42",
      username: "thsottiaux",
      sinceId: "1",
    });
    expect(result.posts.map((p) => p.id)).toEqual(["10", "3"]);
    expect(result.newestId).toBe("10");
    const url = fetcher.mock.calls[1][0] as URL;
    expect(url.searchParams.get("since_id")).toBe("1");
    expect(url.searchParams.get("pagination_token")).toBe("page2");
  });
  it("fails on partial API errors or repeated page tokens", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json({
            data: [{ id: "10", text: "reset" }],
            meta: { next_token: "repeat" },
          }),
        ),
      );
    await expect(
      new XClient("secret", fetcher).getPosts({
        userId: "42",
        username: "thsottiaux",
        sinceId: "1",
      }),
    ).rejects.toThrow("pagination incomplete");
  });
  it("does not treat a malformed successful response as an empty timeline", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({}),
      );
    await expect(
      new XClient("secret", fetcher).getPosts({
        userId: "42",
        username: "thsottiaux",
      }),
    ).rejects.toThrow("Invalid X timeline");
  });
});
