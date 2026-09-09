import { readFile, appendFile } from "node:fs/promises";

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!summaryPath) process.exit(0);
const statePath = process.env.STATE_PATH || "data/state.json";

let markdown = "## Monitor run\n\n";
try {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const pending = Array.isArray(state.outbox) ? state.outbox.length : 0;
  const latest = Array.isArray(state.matches) && state.matches.length
    ? state.matches[0]
    : null;
  markdown += [
    "| Field | Value |",
    "| --- | --- |",
    `| Status | \`${state.lastRunStatus ?? "unknown"}\` |`,
    `| Target | @${state.username ?? "unknown"} |`,
    `| Last checked | ${state.lastCheckedAt ?? "not yet"} |`,
    `| Last successful collection | ${state.lastSuccessAt ?? "not yet"} |`,
    `| Posts scanned | ${state.postsScanned ?? 0} |`,
    `| Detected signals | ${Array.isArray(state.matches) ? state.matches.length : 0} |`,
    `| Pending deliveries | ${pending} |`,
    "",
  ].join("\n");
  if (latest) {
    markdown += [
      "### Latest detected signal",
      "",
      `- Post: ${latest.url ?? "unknown"}`,
      `- Detected: ${latest.detectedAt ?? "unknown"}`,
      `- Events: ${Array.isArray(latest.events) ? latest.events.map((event) => `${event.type}/${event.status}`).join(", ") : "legacy record"}`,
      "",
    ].join("\n");
  }
} catch {
  markdown += "State is unavailable or could not be parsed. Check the monitor step logs.\n";
}

await appendFile(summaryPath, `${markdown}\n`, "utf8");
