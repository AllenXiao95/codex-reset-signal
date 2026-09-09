import { readFile, appendFile } from "node:fs/promises";

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!summaryPath) process.exit(0);

let markdown = "## Monitor run\n\n";
try {
  const state = JSON.parse(await readFile("data/state.json", "utf8"));
  const pending = Array.isArray(state.outbox) ? state.outbox.length : 0;
  markdown += [
    "| Field | Value |",
    "| --- | --- |",
    `| Status | \`${state.lastRunStatus ?? "unknown"}\` |`,
    `| Target | @${state.username ?? "unknown"} |`,
    `| Last checked | ${state.lastCheckedAt ?? "not yet"} |`,
    `| Posts scanned | ${state.postsScanned ?? 0} |`,
    `| Pending deliveries | ${pending} |`,
    "",
  ].join("\n");
} catch {
  markdown += "State is unavailable or could not be parsed. Check the monitor step logs.\n";
}

await appendFile(summaryPath, `${markdown}\n`, "utf8");
