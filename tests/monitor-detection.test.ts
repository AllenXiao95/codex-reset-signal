import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { runMonitor } from "../src/monitor";
import { emptyState, writeState } from "../src/state";

const dirs: string[] = [];
const post = {
  id: "2",
  text: "Codex will reset in two hours.",
  createdAt: "2026-09-09T01:00:00Z",
  url: "https://x.com/thsottiaux/status/2",
  media: [],
};

async function fixture(bootstrapped: boolean) {
  const dir = await mkdtemp(join(tmpdir(), "reset-dashboard-"));
  dirs.push(dir);
  const config = loadConfig({
    STATE_PATH: join(dir, "state.json"),
    PUBLIC_STATUS_PATH: join(dir, "status.json"),
  });
  if (bootstrapped) {
    await writeState(config.statePath, {
      ...emptyState("thsottiaux", "reset"),
      sinceId: "1",
    });
  }
  const source = {
    resolveUserId: vi.fn().mockResolvedValue("42"),
    getPosts: vi.fn().mockResolvedValue({ posts: [post], newestId: "2" }),
  };
  return { config, source };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("detected signal persistence", () => {
  it("parses bootstrap history for the dashboard without notifying it", async () => {
    const { config, source } = await fixture(false);
    const send = vi.fn();
    const state = await runMonitor(config, {
      source,
      targets: [{ id: "summary", channel: "github-summary", send }],
    });

    expect(send).not.toHaveBeenCalled();
    expect(state.matches).toHaveLength(1);
    expect(state.matches[0].events[0].type).toBe("reset");
    const publicStatus = JSON.parse(await readFile(config.publicStatusPath!, "utf8"));
    expect(publicStatus.latest.reset.id).toBe("2");
  });

  it("keeps a detected reset public when notification delivery fails", async () => {
    const { config, source } = await fixture(true);
    await expect(
      runMonitor(config, {
        source,
        targets: [
          {
            id: "external",
            channel: "webhook",
            send: vi.fn().mockRejectedValue(new Error("temporary transport failure")),
          },
        ],
      }),
    ).rejects.toThrow("will retry");

    const publicStatus = JSON.parse(await readFile(config.publicStatusPath!, "utf8"));
    expect(publicStatus.latest.reset.id).toBe("2");
    expect(publicStatus.latest.reset.deliveryChannels).toEqual([]);
    expect(publicStatus.monitor.lastRunStatus).toBe("failed-1");
  });
});
