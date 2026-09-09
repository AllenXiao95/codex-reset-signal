# Codex Reset Signal

**English** | [简体中文](README.zh-CN.md)

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)

**Live dashboard:** [https://reset.onlyax.com/](https://reset.onlyax.com/)

Monitor public X posts from [Tibo (@thsottiaux)](https://x.com/thsottiaux), detect reset / reset-bank signals, extract event times, and publish a timezone-aware dashboard plus optional notifications.

Derived from [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal), with the upstream copyright notice and MIT license preserved. Not an official OpenAI, X, or Cloudflare service.

## How it works

```text
GitHub schedule
or Cloudflare Cron → workflow_dispatch
              ↓
         GitHub Actions
              ↓
            FxEmbed
              ↓
       event extraction
         ├─ public status → monitor-state/status.json → Dashboard
         └─ outbox → GitHub Summary / Telegram / Discord / Webhook / Email / SMS
```

- FxEmbed is the default source and needs no X API token or cookie.
- Detection and notification delivery are separate; delivery failure does not hide a detected signal.
- Event timestamps are stored in UTC and converted only for display.
- Runtime state lives on the dedicated `monitor-state` branch, not `main`.
- The dashboard polls status every **5 minutes while visible**. Hidden tabs stop polling and refresh immediately when visible again.

## Quick start

### GitHub Actions monitor

1. Fork or clone the repository and enable Actions.
2. Run **Monitor X for reset** once with `workflow_dispatch`.
3. The built-in ~5 minute GitHub schedule is enabled unless repository variable `MONITOR_ENABLED=false`.
4. Add notification secrets only for channels you actually use.

The monitor writes:

```text
monitor-state/
├─ state.json   # internal cursor / seen / outbox / delivery checkpoints
└─ status.json  # public dashboard projection
```

### Cloudflare dashboard

For an existing repository, use **Workers & Pages → Create application → Import a repository**.

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

Use a dedicated Custom Domain for the dashboard. The maintainer deployment is:

```text
https://reset.onlyax.com/
```

`RESET_STATUS_URL` is optional; the canonical deployment already defaults to this repository's `monitor-state/status.json`.

### Optional Cloudflare scheduler

If GitHub scheduled events are unreliable, deploy the separate scheduler Worker:

```bash
npm run deploy:cloudflare:scheduler
```

It needs only Cloudflare Secret `GITHUB_TOKEN` with repository-scoped GitHub Actions write permission. When Cloudflare Cron is the active scheduler, set GitHub Repository Actions Variable:

```text
MONITOR_ENABLED=false
```

This disables GitHub's own schedule but keeps manual and Cloudflare-triggered `workflow_dispatch` available.

Full setup: [docs/cloudflare.md](docs/cloudflare.md)

## Notifications

| Channel | Configuration |
| --- | --- |
| GitHub Actions | Built-in Job Summary |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| Webhook | `WEBHOOK_URLS`; optional `WEBHOOK_SECRET` |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SMS_TO` |

Webhook details: [docs/webhook.md](docs/webhook.md)

## Local / Docker

```bash
cp monitor.env.example .env
npm run monitor
# or
npm run monitor:loop
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

Useful defaults:

| Variable | Default |
| --- | --- |
| `SOURCE_PROVIDER` | `fxembed` |
| `X_USERNAME` | `thsottiaux` |
| `MATCH_WORD` | `reset` |
| `TARGET_TIMEZONE` | `Asia/Shanghai` |
| `POLL_INTERVAL_SECONDS` | `300` |

The parser distinguishes exact times, windows, date-only events, observed announcement times, and unresolved times instead of fabricating a single timestamp.

## Validation

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run cloudflare:dry-run
npm run cloudflare:scheduler:dry-run
```

## License

[MIT](LICENSE). Upstream copyright notice is preserved.
