# Cloudflare deployment and scheduling

This guide documents the recommended Cloudflare setup for `codex-reset-signal` when you already have a Cloudflare account, a managed domain, and an existing GitHub repository/fork.

The recommended split is intentionally simple:

```text
Cloudflare
├─ codex-reset-signal
│    └─ Dashboard + /api/status
│         └─ reset.example.com
│
└─ codex-reset-signal-scheduler
     └─ Cron every ~5 minutes
          ↓
       GitHub workflow_dispatch
          ↓
       .github/workflows/monitor.yml
          ↓
       monitor-state/status.json
```

The dashboard Worker and scheduler Worker are separate on purpose. A dashboard deployment failure should not stop monitoring, and a scheduler failure should not break the already-deployed dashboard.

## 1. Deploy the dashboard Worker

If the repository already exists in your GitHub account, use the existing-repository flow instead of the **Deploy to Cloudflare** template button:

1. Cloudflare Dashboard → **Workers & Pages** → **Create application**.
2. Choose **Import a repository**.
3. Select your existing `codex-reset-signal` repository/fork.
4. Keep the repository root as the build root.
5. Configure:

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

6. Deploy.

The first dashboard deployment does not require Telegram, Twilio, Resend, X API, or other monitor secrets.

## 2. Bind a custom domain to the dashboard

For a dedicated dashboard hostname, prefer a **Custom Domain** over a Worker Route.

Example:

```text
reset.example.com
```

In Cloudflare:

1. Open **Workers & Pages → codex-reset-signal**.
2. Open **Settings → Domains & Routes**.
3. Add a **Custom Domain**.
4. Enter the dedicated hostname, for example `reset.example.com`.

With a Custom Domain, the same Worker handles both the dashboard and its API route:

```text
https://reset.example.com/
https://reset.example.com/api/status
```

No separate route is required for `/api/status`.

A Worker Route is mainly useful when a hostname already has another origin and only selected paths should be intercepted. This application expects to own its frontend paths and assets, so a dedicated subdomain is the simpler and safer deployment model.

Do not hard-code a personal domain into the repository `wrangler.jsonc`; fork users should be able to deploy without inheriting another user's hostname.

## 3. `RESET_STATUS_URL` is optional

The dashboard reads public monitor state through `/api/status`.

```text
Dashboard
   ↓
/api/status
   ↓
monitor-state/status.json
```

`RESET_STATUS_URL` is only an override for that status source.

For the canonical repository `AllenXiao95/codex-reset-signal`, the built-in default already points to:

```text
https://raw.githubusercontent.com/AllenXiao95/codex-reset-signal/monitor-state/status.json
```

So the maintainer deployment normally does **not** need to set `RESET_STATUS_URL`.

Set it only when the status source differs, for example after a fork, repository rename, owner migration, path change, or external status storage:

```text
RESET_STATUS_URL=https://raw.githubusercontent.com/<owner>/<repo>/monitor-state/status.json
```

If configured in Cloudflare, this is a normal Worker runtime variable, not a secret.

## 4. Optional: use Cloudflare Cron instead of GitHub schedule

GitHub Actions already includes a roughly five-minute `schedule` trigger. If it works reliably for your repository, no Cloudflare scheduler is required.

If GitHub is not creating scheduled runs reliably, Cloudflare Cron can act only as the clock while the existing GitHub workflow remains the executor:

```text
Cloudflare Cron
      ↓
GitHub workflow_dispatch
      ↓
monitor.yml
      ↓
FxEmbed → parser → monitor-state
```

This avoids duplicating the monitor implementation inside Cloudflare.

### 4.1 Create a scheduler Worker

Create a second Worker named, for example:

```text
codex-reset-signal-scheduler
```

Use this minimal Worker:

```js
export default {
  async scheduled(controller, env, ctx) {
    const response = await fetch(
      "https://api.github.com/repos/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "codex-reset-signal-scheduler",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main" }),
      },
    );

    if (response.status !== 204) {
      throw new Error(`GitHub workflow dispatch failed: ${response.status}`);
    }
  },
};
```

Fork users should replace the repository owner/name in the URL with their own repository.

The scheduler Worker does not need a public HTTP endpoint, Custom Domain, or Worker Route. Cron invokes its `scheduled()` handler directly.

### 4.2 Create the GitHub token

Create a GitHub fine-grained personal access token restricted to the target repository.

Recommended minimum repository permission:

```text
Actions: Read and write
```

Do not grant unrelated write permissions.

In the scheduler Worker, add the token as a Cloudflare **Secret**:

```text
GITHUB_TOKEN=<fine-grained GitHub token>
```

This is different from `RESET_STATUS_URL`:

| Setting | Platform | Type | Purpose |
| --- | --- | --- | --- |
| `RESET_STATUS_URL` | Cloudflare dashboard Worker | Runtime variable, optional | Override dashboard status source |
| `GITHUB_TOKEN` | Cloudflare scheduler Worker | Secret | Authorize GitHub `workflow_dispatch` |
| `MONITOR_ENABLED` | GitHub Actions | Repository Actions Variable | Enable/disable GitHub's own schedule |

### 4.3 Add the Cron Trigger

Open the scheduler Worker and add a Cron Trigger.

A simple five-minute schedule is:

```text
*/5 * * * *
```

An offset schedule avoids the top-of-minute pattern used by many jobs:

```text
2,7,12,17,22,27,32,37,42,47,52,57 * * * *
```

Cron schedules are interpreted in UTC. For a five-minute cadence, timezone does not change the behavior.

## 5. Disable GitHub's own schedule when Cloudflare is the clock

Do not intentionally run both schedulers long-term.

When Cloudflare Cron is the active scheduler, create this GitHub repository variable:

```text
Repository → Settings → Secrets and variables → Actions → Variables

Name:  MONITOR_ENABLED
Value: false
```

`MONITOR_ENABLED` is a **Repository Actions Variable**. It is not a GitHub Environment variable and it is not a Secret.

The workflow condition keeps manual and Cloudflare-triggered dispatches available even when the GitHub schedule is disabled:

```text
GitHub schedule       disabled
workflow_dispatch     enabled
Cloudflare Cron       enabled
```

To return to GitHub scheduling later, remove the variable or set it to a value other than `false`, then remove/disable the Cloudflare Cron Trigger.

## 6. Recommended final configuration

| Component | Domain / Route | Trigger | Configuration |
| --- | --- | --- | --- |
| `codex-reset-signal` dashboard Worker | Dedicated Custom Domain such as `reset.example.com` | HTTP requests | `RESET_STATUS_URL` only when overriding the default source |
| `codex-reset-signal-scheduler` | None required | Cloudflare Cron | Secret `GITHUB_TOKEN` |
| GitHub `monitor.yml` | N/A | `workflow_dispatch`; built-in schedule optional | Repository variable `MONITOR_ENABLED=false` when Cloudflare Cron is active |

The final data path is:

```text
Cloudflare scheduler
      ↓
GitHub workflow_dispatch
      ↓
monitor.yml
      ↓
FxEmbed
      ↓
monitor-state/status.json
      ↓
Cloudflare dashboard /api/status
      ↓
reset.example.com
```

## 7. Verification

After configuring the scheduler:

1. Confirm the Cloudflare Cron Trigger exists.
2. Confirm the scheduler Worker contains secret `GITHUB_TOKEN`.
3. Confirm GitHub `MONITOR_ENABLED=false` is a Repository Actions Variable if Cloudflare is the active clock.
4. Verify a new GitHub **Monitor X for reset** run appears with event `workflow_dispatch` after a Cron execution.
5. Verify `monitor-state/status.json` receives a new `lastCheckedAt` / `lastSuccessAt` update.
6. Open the custom dashboard domain and verify `/api/status` and the rendered monitor freshness agree.

If Cloudflare Cron runs but no GitHub run appears, debug the scheduler token/dispatch request first. If the GitHub run appears but `monitor-state` does not update, debug the existing monitor workflow instead.