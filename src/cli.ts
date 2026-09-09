import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { loadConfig, validateConfig } from "./config";
import { extractEvents } from "./events";
import { renderText } from "./notifications";
import { runMonitor } from "./monitor";
import type { XPost } from "./types";

if (existsSync(".env")) process.loadEnvFile(".env");
const dryRun = process.argv.includes("--dry-run");
const loop = process.argv.includes("--loop");
const config = loadConfig();
const errors = validateConfig(config, { offline: dryRun });
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else if (dryRun) {
  const index = process.argv.indexOf("--input");
  const path =
    index >= 0
      ? process.argv[index + 1]
      : new URL("../fixtures/posts.json", import.meta.url);
  if (!path) throw new Error("--input requires a JSON file path");
  const posts = JSON.parse(await readFile(path, "utf8")) as XPost[];
  for (const post of posts) {
    const events = extractEvents(post, config.sourceTimezone).filter(
      (e) => config.includeMentions || e.type !== "mention",
    );
    if (events.length)
      console.log(renderText(post, events, config.timezone) + "\n");
  }
} else {
  const interval = Number(process.env.POLL_INTERVAL_SECONDS || 300);
  if (!Number.isFinite(interval) || interval < 60)
    throw new Error("POLL_INTERVAL_SECONDS must be at least 60");
  const shutdown = new AbortController();
  process.on("SIGTERM", () => shutdown.abort());
  process.on("SIGINT", () => shutdown.abort());
  do {
    try {
      const state = await runMonitor(config);
      console.log(
        `Checked @${state.username} via ${config.sourceProvider}; ${state.lastRunStatus}; ${state.outbox?.length ?? 0} pending.`,
      );
    } catch (error) {
      // Adapters redact provider responses and URL/token-bearing transport errors.
      console.error(error instanceof Error ? error.message : "Monitor failed");
      if (!loop) process.exitCode = 1;
    }
    if (!loop || shutdown.signal.aborted) break;
    try {
      await setTimeout(interval * 1000, undefined, { signal: shutdown.signal });
    } catch {
      break;
    }
  } while (!shutdown.signal.aborted);
}
