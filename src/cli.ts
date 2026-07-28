import { loadConfig, validateConfig } from "./config";
import { runMonitor } from "./monitor";

const dryRun = process.argv.includes("--dry-run");
const config = loadConfig();

if (dryRun) {
  config.xBearerToken ||= "dry-run-token";
  config.emailTo = [];
  config.smsTo = ["+15555550123"];
  config.twilioAccountSid = "AC00000000000000000000000000000000";
  config.twilioAuthToken = "dry-run";
  config.twilioFrom = "+15555550100";
}

const errors = validateConfig(config);
if (errors.length && !dryRun) {
  console.error(errors.map((error) => `• ${error}`).join("\n"));
  process.exitCode = 1;
} else if (dryRun) {
  console.log("Dry-run validates configuration only; it does not call external APIs.");
  console.log(`Target: @${config.username} · keyword: ${config.keyword}`);
} else {
  try {
    const state = await runMonitor(config);
    console.log(
      `Checked @${state.username}; ${state.lastRunStatus}; ${state.matches.length} retained match(es).`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
