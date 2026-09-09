import { describe, expect, it, vi } from "vitest";
import { FxEmbedClient } from "../src/fxembed-client";
import { loadConfig, validateConfig } from "../src/config";
import { createPostSource } from "../src/post-source";
import { XClient } from "../src/x-client";

const options = { userId: "42", username: "thsottiaux", sinceId: "100" };
const post = (id: string, extra = {}) => ({
  type: "status", id, author: { id: "42", screen_name: "thsottiaux" },
  text: "Codex reset in two hours", created_timestamp: 1788915600,
  media: {}, ...extra,
});
const page = (results: unknown[], bottom: string | null = null) =>
  Response.json({ code: 200, results, cursor: { top: null, bottom } });

describe("FxEmbed source", () => {
  it("defaults to FxEmbed with no token and requires explicit paid selection", () => {
    const config = loadConfig({ DISCORD_WEBHOOK_URLS: "https://discord.com/api/webhooks/123/abc" });
    expect(validateConfig(config)).toEqual([]);
    expect(createPostSource({ ...config, xBearerToken: "unused" })).toBeInstanceOf(FxEmbedClient);
    expect(createPostSource({ ...config, sourceProvider: "x" })).toBeInstanceOf(XClient);
    expect(validateConfig({ ...config, sourceProvider: "x" })).toContain(
      "X_BEARER_TOKEN is required when SOURCE_PROVIDER=x.",
    );
    expect(() => loadConfig({ SOURCE_PROVIDER: "typo" })).toThrow("SOURCE_PROVIDER");
  });
  it("resolves and validates the account without credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      code: 200, user: { id: "42", screen_name: "ThSoTtIaUx" },
    }));
    expect(await new FxEmbedClient(fetcher).resolveUserId("thsottiaux")).toBe("42");
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
  });
  it("rejects a mismatched profile", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      code: 200, user: { id: "42", screen_name: "someone_else" },
    }));
    await expect(new FxEmbedClient(fetcher).resolveUserId("thsottiaux")).rejects.toThrow("profile");
  });
  it("filters foreign context and reposts, retaining own replies and original long text", async () => {
    const full = "Codex reset in two hours. " + "More details. ".repeat(100);
    const fetcher = vi.fn().mockResolvedValue(page([
      post("999", { author: { id: "99", screen_name: "thsottiaux" } }),
      post("200", { reposted_by: { id: "42" } }),
      post("150", { raw_text: { text: full }, text: "truncated",
        replying_to: { status: "80" }, quote: post("800"),
        media: { all: [{ id: "m", type: "photo", url: "https://pbs.twimg.com/a.jpg", altText: "Diagram" }] } }),
      post("99"),
    ]));
    const result = await new FxEmbedClient(fetcher).getPosts(options);
    expect(result.posts).toHaveLength(1);
    expect(result.newestId).toBe("150");
    expect(result.latestObservedPost?.id).toBe("150");
    expect(result.posts[0]).toMatchObject({ text: full, createdAt: "2026-09-09T01:00:00.000Z",
      media: [{ mediaKey: "m", type: "photo", altText: "Diagram" }],
      url: "https://x.com/thsottiaux/status/150" });
    const url = fetcher.mock.calls[0][0] as URL;
    expect(url.searchParams.get("with_replies")).toBe("1");
    expect(url.searchParams.has("since")).toBe(false);
    expect(url.searchParams.has("lang")).toBe(false);
  });
  it("observes the latest authored post even when it is already at the checkpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([post("150"), post("100")]));
    const result = await new FxEmbedClient(fetcher).getPosts({ ...options, sinceId: "150" });
    expect(result.posts).toEqual([]);
    expect(result.newestId).toBeNull();
    expect(result.latestObservedPost?.id).toBe("150");
  });
  it("excludes replies on request", async () => {
    const fetcher = vi.fn().mockResolvedValue(page([post("150", { replying_to: { status: "80" } }), post("140")]));
    const result = await new FxEmbedClient(fetcher).getPosts({ ...options, excludeReplies: true });
    expect(result.posts.map(p => p.id)).toEqual(["140"]);
    expect(result.latestObservedPost?.id).toBe("140");
    expect((fetcher.mock.calls[0][0] as URL).searchParams.has("with_replies")).toBe(false);
  });
  it("ignores old ancestors as stopping signals, deduplicates pages, and stops at an entirely old page", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([post("80"), post("150")], "two"))
      .mockResolvedValueOnce(page([post("150"), post("120")], "three"))
      .mockResolvedValueOnce(page([post("100"), post("70")], "four"));
    const result = await new FxEmbedClient(fetcher).getPosts(options);
    expect(result.posts.map(p => p.id)).toEqual(["150", "120"]);
    expect(result.newestId).toBe("150");
    expect(result.latestObservedPost?.id).toBe("150");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect((fetcher.mock.calls[1][0] as URL).searchParams.get("cursor")).toBe("two");
  });
  it("does not stop on a page containing only foreign context newer than the checkpoint", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(page([post("200", { author: { id: "99" } })], "two"))
      .mockResolvedValueOnce(page([post("150")]));
    expect((await new FxEmbedClient(fetcher).getPosts(options)).newestId).toBe("150");
  });
  it("bootstraps from one page and distinguishes a valid empty timeline", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(page([post("150")], "two"))
      .mockResolvedValueOnce(page([]));
    await new FxEmbedClient(fetcher).getPosts({ ...options, sinceId: null, bootstrap: true });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await new FxEmbedClient(fetcher).getPosts(options)).toEqual({
      posts: [],
      newestId: null,
      latestObservedPost: null,
    });
  });
  it.each([{}, { code: 429, results: [], cursor: {} }, { code: 200, results: [], cursor: {}, stale: true },
    { code: 200, results: [], cursor: {}, errors: ["partial"] },
    { code: 200, results: [post("150", { author: {} })], cursor: {} },
    { code: 200, results: [post("150", { created_timestamp: null })], cursor: {} },
  ])("fails closed for malformed, partial or stale responses: %j", async body => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    await expect(new FxEmbedClient(fetcher).getPosts(options)).rejects.toThrow();
  });
  it.each([204, 429, 503])("rejects HTTP %s without trying another source", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(new FxEmbedClient(fetcher).getPosts(options)).rejects.toThrow(`HTTP ${status}`);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects HTML, transport errors and repeated cursors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("<html>unavailable</html>"))
      .mockRejectedValueOnce(new Error("secret-url"))
      .mockImplementation(async () => page([post("150")], "repeat"));
    const client = new FxEmbedClient(fetcher);
    await expect(client.getPosts(options)).rejects.toThrow("Invalid FxEmbed JSON");
    await expect(client.getPosts(options)).rejects.toThrow(/^FxEmbed request failed$/);
    await expect(client.getPosts(options)).rejects.toThrow("pagination repeated");
  });
  it("discards the batch when a later page fails", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(page([post("150")], "two"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(new FxEmbedClient(fetcher).getPosts(options)).rejects.toThrow("HTTP 503");
  });
});
