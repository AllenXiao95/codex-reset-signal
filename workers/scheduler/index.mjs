const DEFAULT_REPOSITORY = "AllenXiao95/codex-reset-signal";
const DEFAULT_WORKFLOW = "monitor.yml";
const DEFAULT_REF = "main";

function readSetting(env, key, fallback) {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function validateRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("GITHUB_REPOSITORY must be in owner/repo form");
  }
}

async function dispatchMonitor(env) {
  const token = readSetting(env, "GITHUB_TOKEN", "");
  if (!token) {
    throw new Error("GITHUB_TOKEN secret is required");
  }

  const repository = readSetting(env, "GITHUB_REPOSITORY", DEFAULT_REPOSITORY);
  const workflow = readSetting(env, "GITHUB_WORKFLOW", DEFAULT_WORKFLOW);
  const ref = readSetting(env, "GITHUB_REF", DEFAULT_REF);
  validateRepository(repository);

  const url = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "codex-reset-signal-scheduler",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref }),
  });

  const body = await response.text();
  if (!response.ok) {
    console.error(
      JSON.stringify({
        event: "github_workflow_dispatch_failed",
        repository,
        workflow,
        ref,
        status: response.status,
      }),
    );
    throw new Error(`GitHub workflow dispatch failed with HTTP ${response.status}`);
  }

  let payload = null;
  if (body) {
    try {
      payload = JSON.parse(body);
    } catch {
      payload = null;
    }
  }

  console.log(
    JSON.stringify({
      event: "github_workflow_dispatch_succeeded",
      repository,
      workflow,
      ref,
      status: response.status,
      workflowRunId: payload?.workflow_run_id ?? null,
      workflowRunUrl: payload?.html_url ?? payload?.run_url ?? null,
    }),
  );
}

export default {
  async scheduled(controller, env) {
    console.log(
      JSON.stringify({
        event: "cron_started",
        cron: controller.cron,
        scheduledAt: new Date(controller.scheduledTime).toISOString(),
      }),
    );

    await dispatchMonitor(env);
  },
};
