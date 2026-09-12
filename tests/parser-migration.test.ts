import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { runMonitor } from "../src/monitor";
import { emptyState, writeState } from "../src/state";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

it("reprojects saved matches after a parser upgrade without creating historical delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reset-parser-migration-"));
  dirs.push(dir);
  const config = loadConfig({
    STATE_PATH: join(dir, "state.json"),
    PUBLIC_STATUS_PATH: join(dir, "status.json"),
  });
  const text = "Reset all propagated. Sweet dreams.";
  await writeState(config.statePath, {
    ...emptyState("thsottiaux", "reset"),
    sinceId: "2",
    eventParserVersion: 4,
    matches: [
      {
        version: "old-version",
        id: "2",
        text,
        createdAt: "2026-09-12T08:09:17.000Z",
        url: "https://x.com/thsottiaux/status/2",
        media: [],
        detectedAt: "2026-09-12T08:12:33.444Z",
        channels: [],
        events: [
          {
            type: "mention",
            status: "uncertain",
            evidence: "Reset all propagated",
            time: {
              kind: "unknown",
              start: null,
              end: null,
              evidence: "Reset all propagated",
            },
          },
        ],
      },
    ],
  });

  const send = vi.fn();
  const source = {
    resolveUserId: vi.fn().mockResolvedValue("42"),
    getPosts: vi.fn().mockResolvedValue({ posts: [], newestId: null }),
  };
  const state = await runMonitor(config, {
    source,
    targets: [{ id: "summary", channel: "github-summary", send }],
  });

  expect(send).not.toHaveBeenCalled();
  expect(state.outbox).toEqual([]);
  expect(state.eventParserVersion).toBe(5);
  expect(state.matches[0].events[0]).toMatchObject({
    type: "reset",
    status: "completed",
    time: { kind: "observed", start: "2026-09-12T08:09:17.000Z" },
  });
  const publicStatus = JSON.parse(await readFile(config.publicStatusPath!, "utf8"));
  expect(publicStatus.latest.reset.id).toBe("2");
});
