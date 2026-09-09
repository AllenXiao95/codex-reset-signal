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

### 4.1 Scheduler Worker is included in the repository

The deployable scheduler runtime lives at:

```text
workers/scheduler/index.mjs
workers/scheduler/wrangler.jsonc
```

Its `scheduled()` handler calls GitHub's workflow-dispatch API for `monitor.yml`. The default target is the canonical repository and `main` branch.

The included Wrangler configuration also contains the offset five-minute Cron Trigger:

```text
2,7,12,17,22,27,32,37,42,47,52,57 * * * *
```

The scheduler Worker does not need a public HTTP endpoint, Custom Domain, or Worker Route. Cron invokes `scheduled()` directly.

Validate it without deploying:

```bash
npm run cloudflare:scheduler:dry-run
```

Deploy it:

```bash
npm run deploy:cloudflare:scheduler
```

Alternatively, connect a second Cloudflare Worker to the same repository and use this deploy command for that Worker:

```text
npx wrangler deploy --config workers/scheduler/wrangler.jsonc
```

The target Worker name is `codex-reset-signal-scheduler`.

### 4.2 Create the GitHub token

Create a GitHub fine-grained personal access token restricted to the target repository.

Minimum repository permission required for workflow dispatch:

```text
Actions: Read and write
```

Do not grant unrelated write permissions.

In `codex-reset-signal-scheduler`, add the token as a Cloudflare **Secret**:

```text
GITHUB_TOKEN=<fine-grained GitHub token>
```

For the canonical maintainer deployment, that is the only required scheduler setting.

Fork users can optionally override these normal Worker runtime variables:

```text
GITHUB_REPOSITORY=<owner>/<repo>
GITHUB_WORKFLOW=monitor.yml
GITHUB_REF=main
```

The defaults are:

```text
GITHUB_REPOSITORY=AllenXiao95/codex-reset-signal
GITHUB_WORKFLOW=monitor.yml
GITHUB_REF=main
```

The settings have different scopes and should not be mixed:

| Setting | Platform | Type | Purpose |
| --- | --- | --- | --- |
| `RESET_STATUS_URL` | Cloudflare dashboard Worker | Runtime variable, optional | Override dashboard status source |
| `GITHUB_TOKEN` | Cloudflare scheduler Worker | Secret | Authorize GitHub `workflow_dispatch` |
| `GITHUB_REPOSITORY` | Cloudflare scheduler Worker | Runtime variable, optional | Override dispatch target for a fork |
| `MONITOR_ENABLED` | GitHub Actions | Repository Actions Variable | Enable/disable GitHub's own schedule |

### 4.3 What a Cron execution actually updates

A Cron execution does **not** create a new Cloudflare deployment. It invokes the already-deployed scheduler Worker.

Expected chain:

```text
Cron event
  ↓
scheduler scheduled()
  ↓
POST GitHub workflow_dispatch
  ↓
new "Monitor X for reset" Actions run
  ↓
monitor updates monitor-state/state.json + status.json
  ↓
Dashboard /api/status reads the new status.json
```

The scheduler emits structured Worker logs for both stages:

```text
cron_started
github_workflow_dispatch_succeeded
```

On current GitHub API versions, a successful dispatch response is HTTP 200 and can include the new workflow run ID and URL. The scheduler logs these values when present. Any non-2xx response fails the Cron invocation instead of silently succeeding.

Cloudflare Cron Trigger changes can take several minutes to propagate globally, so allow up to about 15 minutes after first creating or modifying a trigger before treating absence of executions as a configuration failure.

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
| `codex-reset-signal-scheduler` | None required | Cloudflare Cron | Secret `GITHUB_TOKEN`; fork target variables optional |
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

## 7. Verification and troubleshooting

After configuring the scheduler:

1. Confirm `codex-reset-signal-scheduler` is deployed with the repository's `workers/scheduler/index.mjs` code.
2. Confirm its Cloudflare Secret `GITHUB_TOKEN` exists.
3. Confirm its Cron Trigger exists.
4. If Cloudflare is the active clock, confirm GitHub `MONITOR_ENABLED=false` is a Repository Actions Variable.
5. Open Cloudflare Worker logs / Cron Past Events and look for `cron_started` followed by `github_workflow_dispatch_succeeded`.
6. Verify a new GitHub **Monitor X for reset** run appears with event `workflow_dispatch`.
7. Verify `monitor-state/status.json` receives a new `lastCheckedAt` / `lastSuccessAt` update.
8. Open the custom dashboard domain and verify `/api/status` and the rendered monitor freshness agree.

Interpret failures by boundary:

```text
No Cron event/log
  → Cron trigger not propagated/enabled or wrong Worker

cron_started but dispatch failure
  → GITHUB_TOKEN / Actions write permission / repository target problem

GitHub workflow_dispatch appears but monitor-state does not update
  → existing monitor.yml / FxEmbed / state persistence problem

monitor-state updates but dashboard stays stale
  → Dashboard status source/cache problem
```

Cloudflare Cron executions are runtime invocations, not deployments, so **Deployments** is not the place to verify each five-minute run.