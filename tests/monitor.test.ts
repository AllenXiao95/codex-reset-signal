import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FxEmbedClient } from "../src/fxembed-client";
import { loadConfig } from "../src/config";
import { runMonitor } from "../src/monitor";
import { emptyState, writeState } from "../src/state";
const directories: string[] = [];
const post = {
  id: "2",
  text: "Codex will reset in two hours.",
  createdAt: "2026-09-09T01:00:00Z",
  url: "https://x.com/thsottiaux/status/2",
  media: [],
};
async function setup(seed = true) {
  const dir = await mkdtemp(join(tmpdir(), "reset-signal-"));
  directories.push(dir);
  const config = loadConfig({ STATE_PATH: join(dir, "state.json") });
  if (seed)
    await writeState(config.statePath, {
      ...emptyState("thsottiaux", "reset"),
      sinceId: "1",
    });
  const client = {
    resolveUserId: vi.fn().mockResolvedValue("42"),
    getPosts: vi.fn().mockResolvedValue({ posts: [post], newestId: "2" }),
  };
  return { config, client };
}
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
describe("durable monitor delivery", () => {
  it("bootstraps silently and migrates old state", async () => {
    const { config, client } = await setup(false);
    const send = vi.fn();
    const state = await runMonitor(config, {
      xClient: client,
      targets: [{ id: "a", channel: "fake", send }],
    });
    expect(send).not.toHaveBeenCalled();
    expect(state.sinceId).toBe("2");
    expect(state.version).toBe(2);
  });
  it("checkpoints success per recipient and retries only failures after restart", async () => {
    const { config, client } = await setup();
    const a = vi.fn().mockResolvedValue(undefined),
      b = vi
        .fn()
        .mockRejectedValueOnce(new Error("secret=do-not-log"))
        .mockResolvedValue(undefined);
    const targets = [
      { id: "a", channel: "fake", send: a },
      { id: "b", channel: "fake", send: b },
    ];
    await expect(
      runMonitor(config, { xClient: client, targets }),
    ).rejects.toThrow("will retry");
    const saved = JSON.parse(await readFile(config.statePath, "utf8"));
    expect(saved.sinceId).toBe("2");
    expect(saved.outbox[0].delivered).toEqual(["a"]);
    client.getPosts.mockResolvedValue({ posts: [], newestId: null });
    const state = await runMonitor(config, { xClient: client, targets });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    expect(state.outbox).toEqual([]);
  });
  it("keeps draining pending messages during an X outage", async () => {
    const { config, client } = await setup();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValue(undefined);
    const deps = {
      xClient: client,
      targets: [{ id: "a", channel: "fake", send }],
    };
    await expect(runMonitor(config, deps)).rejects.toThrow();
    client.getPosts.mockRejectedValue(new Error());
    await expect(runMonitor(config, deps)).rejects.toThrow(
      "fxembed collection failed",
    );
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(config.statePath, "utf8")).outbox).toEqual(
      [],
    );
  });
  it("deduplicates returned versions but not content corrections", async () => {
    const { config, client } = await setup();
    const send = vi.fn();
    const deps = {
      xClient: client,
      targets: [{ id: "a", channel: "fake", send }],
    };
    await runMonitor(config, deps);
    await runMonitor(config, deps);
    expect(send).toHaveBeenCalledTimes(1);
    client.getPosts.mockResolvedValue({
      posts: [{ ...post, text: "Codex will reset in three hours." }],
      newestId: "2",
    });
    await runMonitor(config, deps);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("does not advance the cursor on partial pagination failure", async () => {
    const { config, client } = await setup();
    client.getPosts.mockRejectedValue(new Error());
    await expect(
      runMonitor(config, {
        xClient: client,
        targets: [{ id: "a", channel: "fake", send: vi.fn() }],
      }),
    ).rejects.toThrow();
    expect(JSON.parse(await readFile(config.statePath, "utf8")).sinceId).toBe(
      "1",
    );
  });
  it("refuses simultaneous writers and mismatched accounts", async () => {
    const { config, client } = await setup();
    const deps = {
      xClient: client,
      targets: [{ id: "a", channel: "fake", send: vi.fn() }],
    };
    await writeFile(`${config.statePath}.lock`, "");
    await expect(runMonitor(config, deps)).rejects.toThrow("locked");
    await rm(`${config.statePath}.lock`);
    await expect(
      runMonitor({ ...config, username: "someone_else" }, deps),
    ).rejects.toThrow("different account");
  });
});


describe("FxEmbed monitor integration", () => {
  it("preserves checkpoints on a later-page failure, then recovers without duplicate delivery", async () => {
    const { config } = await setup();
    const response = (id: string, bottom: string | null) => Response.json({
      code: 200, cursor: { bottom }, results: [{ type: "status", id,
        author: { id: "42" }, text: post.text, created_at: post.createdAt }],
    });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: 200, user: { id: "42", screen_name: "thsottiaux" } }))
      .mockResolvedValueOnce(response("2", "next"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(response("2", "next"))
      .mockResolvedValueOnce(response("1", null))
      .mockResolvedValueOnce(response("2", "next"));
    const send = vi.fn();
    const deps = { source: new FxEmbedClient(fetcher), targets: [{ id: "a", channel: "fake", send }] };
    await expect(runMonitor(config, deps)).rejects.toThrow("fxembed collection failed");
    const failed = JSON.parse(await readFile(config.statePath, "utf8"));
    expect(failed.sinceId).toBe("1");
    expect(failed.lastCheckedAt).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect((await runMonitor(config, deps)).sinceId).toBe("2");
    await runMonitor(config, deps);
    expect(send).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.every(([url]) => (url as URL).hostname === "api.fxtwitter.com")).toBe(true);
  });
});
