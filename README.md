# Codex Reset Signal

**English** | [简体中文](README.zh-CN.md)

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)

Monitor public X posts from [Tibo (@thsottiaux)](https://x.com/thsottiaux), recognize reset / reset bank / banked reset signals, extract event times, and publish both notifications and a live timezone-aware dashboard.

This project is derived from [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal), preserving the upstream copyright notice and MIT license. It is not an official OpenAI, X, or Cloudflare service.

## What it does

```text
Scheduler
  ├─ GitHub Actions schedule
  └─ optional Cloudflare Cron → workflow_dispatch
                    ↓
               GitHub Actions
                    ↓
                  FxEmbed
                    ↓
             event extraction
                    │
        ┌───────────┴───────────┐
        │                       │
 detected signal          durable outbox
        │                       │
 public status       GitHub Summary / Telegram /
        │             Discord / Webhook / Email / SMS
        ↓
Cloudflare dashboard
```

Key properties:

- FxEmbed is the default source and needs no X token or cookie. Official X API v2 remains an explicit optional source.
- Reset detection and notification delivery are separate. A Telegram/Webhook failure does not hide an already detected reset from the dashboard.
- The first run parses the latest page for dashboard history but does **not** send historical notifications unless explicitly enabled locally.
- Relative times are anchored to post publication time. Explicit source timezones, Pacific DST, exact times, windows, date-only events, observed announcement times, and unresolved times remain distinct.
- Event timestamps are persisted canonically in UTC. The dashboard auto-detects the browser IANA timezone and also allows manual selection stored in `localStorage`.
- Scheduled runtime state is stored on the dedicated `monitor-state` branch, not committed to `main`. Runtime commits therefore do not trigger normal `main` CI or Cloudflare rebuilds.
- The public dashboard reads a small `status.json` projection. It never exposes cursor, seen-hash, outbox, recipient checkpoints, or credentials.

## GitHub Actions monitoring

1. Enable Actions for the repository/fork.
2. Manually run **Monitor X for reset** once to validate the setup.
3. Open the run **Summary** to inspect the monitor result.
4. The roughly five-minute GitHub schedule is enabled by default. Set repository variable `MONITOR_ENABLED=false` only when you want to disable GitHub's scheduled runs; manual `workflow_dispatch` still remains available.
5. Configure optional external notification channels under **Settings → Secrets and variables → Actions** when needed.

If Cloudflare Cron is used as the scheduler, set `MONITOR_ENABLED=false` as a **GitHub Repository Actions Variable** so only Cloudflare drives `workflow_dispatch`. See [docs/cloudflare.md](docs/cloudflare.md).

The workflow checks out two branches:

```text
main
  source code + workflow + dashboard

monitor-state
  state.json   # internal cursor / seen / outbox / delivery checkpoints
  status.json  # public dashboard projection
```

`main` no longer receives a state commit every five minutes. GitHub Actions schedules may be delayed and are not a hard real-time SLA.

### Notification channels

| Channel | Configuration |
| --- | --- |
| GitHub Actions | Built-in Job Summary, no secret required |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| Generic webhook | `WEBHOOK_URLS`; optional `WEBHOOK_SECRET`, `WEBHOOK_DEBUG` |
| Resend email | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SMS_TO` |

Each external channel must be configured completely or left blank. Generic webhook details are documented in [docs/webhook.md](docs/webhook.md).

## Live dashboard

The homepage answers the operational question first: **when is the latest reset?**

It shows:

- latest reset event time and status;
- latest bank-credit and bank-expiry signals;
- original post evidence and link;
- automatic or manually selected display timezone;
- countdown for future exact reset times;
- monitor health: `Healthy`, `Delayed`, `Stale`, or `Degraded`;
- recent detected signals, independent of notification delivery success.

Health is derived from both `lastRunStatus` and checkpoint freshness. A stale `lastCheckedAt` is not labeled active merely because it exists.

### Public status contract

The dashboard consumes `monitor-state/status.json`, which contains only a public projection similar to:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-09-09T03:00:00Z",
  "username": "thsottiaux",
  "monitor": {
    "provider": "fxembed",
    "lastCheckedAt": "2026-09-09T03:00:00Z",
    "lastSuccessAt": "2026-09-09T03:00:00Z",
    "lastRunStatus": "checked-2-posts"
  },
  "latest": {
    "reset": null,
    "bankCredit": null,
    "bankExpiry": null
  },
  "recent": []
}
```

Detected signals include parsed `events`, post creation time, detection time, original URL, and successful delivery channel names. Internal runtime state is not part of this contract.

## Cloudflare Workers

Cloudflare Workers is the primary hosted dashboard target. The repository already includes `wrangler.jsonc` and a Worker-compatible vinext entrypoint.

### Dashboard deployment

If you already forked or own this repository, use Cloudflare **Workers & Pages → Create application → Import a repository**. Do not use the Deploy to Cloudflare template button for an existing fork because that flow creates another GitHub/GitLab repository and can collide with the existing repository name.

Use:

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

The initial dashboard deployment needs no application-specific secret.

For a dedicated hostname, prefer a **Custom Domain** such as `reset.example.com`. The same Worker serves both `/` and `/api/status`, so no separate `/api/status` Worker Route is required. Keep personal domains out of `wrangler.jsonc` so forks do not inherit them.

`RESET_STATUS_URL` is optional. The canonical maintainer deployment already defaults to this repository's public `monitor-state/status.json`; configure it only for a fork, renamed/moved repository, changed state path, or custom status backend.

### Optional Cloudflare Cron scheduler

GitHub's built-in schedule remains supported. If GitHub scheduled events are unreliable for a repository, use a separate lightweight Cloudflare scheduler Worker:

```text
Cloudflare Cron
      ↓
GitHub workflow_dispatch
      ↓
monitor.yml
      ↓
FxEmbed → monitor-state
```

The scheduler Worker needs only a Cloudflare Secret `GITHUB_TOKEN` with repository-scoped GitHub Actions write permission and a Cron Trigger such as `*/5 * * * *` (or an offset five-minute schedule). It does **not** need a Custom Domain or Worker Route.

When Cloudflare Cron is the active clock, set GitHub repository Actions Variable:

```text
MONITOR_ENABLED=false
```

This disables only GitHub's own schedule; manual and Cloudflare-triggered `workflow_dispatch` remain available.

Detailed setup, routing choices, token scope, Cron configuration, and verification are in **[docs/cloudflare.md](docs/cloudflare.md)**.

### Deploy Button: only when you want Cloudflare to create a new repository

If you have **not** already forked/cloned this project into your GitHub/GitLab account and want Cloudflare to create a new repository for you, the template flow remains available:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AllenXiao95/codex-reset-signal)

The repository keeps root `.env.example` assignment-free so the template flow does not ask for unrelated monitor notification secrets during first deployment. Full local/Docker monitor configuration lives in `monitor.env.example`.

Validate without deploying:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run cloudflare:dry-run
```

The Worker route `/api/status` reads the public runtime projection on demand, so a monitor update does **not** redeploy the website. No KV, D1, SSE, or WebSocket is required for the dashboard.

## GitHub Pages fallback

GitHub Pages is intentionally a fallback, not a second backend. The dashboard client can fall back to the raw public status source when `/api/status` is unavailable. A Pages deployment therefore needs only a static frontend plus access to the fork's public `monitor-state/status.json`; no runtime monitor logic runs on Pages.

The primary supported build/deploy path remains Cloudflare Workers because the current vinext build contains an SSR Worker entrypoint and API route. Keeping Pages secondary avoids maintaining two independent backend/state implementations.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `SOURCE_PROVIDER` | `fxembed` | `fxembed` or official `x`; no automatic paid fallback |
| `X_USERNAME` | `thsottiaux` | Target X account |
| `MATCH_WORD` | `reset` | Reset parser by default; custom terms use whole-word matching |
| `TARGET_TIMEZONE` | `Asia/Shanghai` | Notification display timezone; dashboard has its own browser selection |
| `SOURCE_TIMEZONE` | empty | Explicit assumption for source-local clock times without a timezone |
| `INCLUDE_MENTIONS` | `true` | Keep clearly unconfirmed reset discussions/requests |
| `X_EXCLUDE_REPLIES` | `false` | Exclude target-authored replies |
| `MONITOR_ENABLED` | enabled unless `false` | GitHub Repository Actions Variable; disables only GitHub's own schedule when set to `false` |
| `BOOTSTRAP_NOTIFY` | `false` | Historical notification opt-in for local runs; Actions forces false |
| `STATE_PATH` | `data/state.json` | Local runtime state path |
| `PUBLIC_STATUS_PATH` | optional | Public projection path; Actions uses `runtime/status.json` |
| `RESET_STATUS_URL` | project status source | Optional Cloudflare dashboard Worker status-source override; maintainer normally leaves it unset |
| `WEBHOOK_DEBUG` | `false` | Sanitized webhook hostname/status/timing diagnostics |
| `POLL_INTERVAL_SECONDS` | `300` | Loop mode polling interval, minimum 60 seconds |

## Time parsing boundaries

| Source text | Result |
| --- | --- |
| `in two hours` | publication time + 2 hours |
| `within the next hour` | time window from publication through one hour later |
| `September 10, 2026 at 5pm PT` | `America/Los_Angeles`, including DST on that date |
| `tomorrow at 5pm` | unresolved unless a source timezone is explicit or configured |
| `September 10 PT` | date range, not a fabricated exact time |
| `bank ... valid for 24 hours` | separate expiry evidence; no exact expiry if the start is ambiguous |
| `we have reset ...` | completed announcement; publication may be an observed time, not account credit time |
| `soon` / multiple ambiguous times | unresolved with source evidence retained |

The rule engine uses chrono-node and Luxon, not an LLM. Complex conditionals, image-only times, cross-post context, edits/deletions, and account-specific actual credit timing are not fully solved.

## Generic webhook debugging

```bash
WEBHOOK_DEBUG=true npm run webhook:debug
```

This uses synthetic fixtures, does not contact X/FxEmbed or mutate monitor state, but **does send a real POST** to configured `WEBHOOK_URLS`. Logs omit URL paths, query strings, credentials, headers, and response bodies.

## Local / Docker

```bash
cp monitor.env.example .env
npm run monitor
npm run monitor:loop
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

Docker keeps runtime state in its own named volume. Do not run independent Actions and Docker instances against the same recipients unless duplicate delivery is acceptable.

## Delivery and recovery semantics

- Detected signals are persisted before notification attempts and immediately become eligible for the public projection.
- Notification candidates enter a durable outbox before outbound delivery.
- Successful targets are checkpointed individually; failed targets retry later.
- Delivery remains **at least once**, not exactly once. Generic webhook consumers should deduplicate by `delivery_id`.
- If Actions cannot push the isolated runtime branch, it uploads `monitor-state-recovery` containing both `state.json` and `status.json`.

## License

[MIT](LICENSE). Upstream copyright notice is preserved.
