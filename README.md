# Codex Reset Signal

**English** | [简体中文](README.zh-CN.md)

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AllenXiao95/codex-reset-signal)

Monitor public X posts from [Tibo (@thsottiaux)](https://x.com/thsottiaux), recognize reset / reset bank / banked reset signals, extract event times, convert them to your target timezone, and deliver alerts through GitHub Actions, bots, generic webhooks, email, or SMS.

This project is derived from [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal), preserving the upstream copyright notice and MIT license. It is not an official OpenAI, X, or Cloudflare service.

## Features

- Uses the public FxEmbed JSON API by default for regular posts, replies, and long-form posts. No X token or cookie is required. Official X API v2 remains an explicit optional source.
- Filters timeline entries by numeric author ID, excludes pure reposts, and parses only the target author's own post text rather than quoted-post or conversation context.
- Distinguishes quota resets, bank credits, bank expiry information, and explicitly unconfirmed reset-related discussions.
- Resolves relative times from the **post publication time** and supports English dates, explicit timezones, Pacific daylight-saving rules, and time windows.
- Uses IANA timezone names. The default output timezone is `Asia/Shanghai`; missing source timezones are not silently guessed.
- Supports GitHub Actions Job Summary, Telegram, Discord, generic JSON webhooks, Resend email, and Twilio SMS.
- Paginates new posts, persists an outbox, checkpoints delivery per target, and uses a single-process state lock.
- First run establishes a cursor by default. Offline fixtures do not access the network, send notifications, or modify monitor state.
- The dashboard can be imported directly to Cloudflare Workers. The monitor itself continues to run through GitHub Actions or Docker.

## Offline validation first

Node.js 22 or newer is required.

```bash
npm ci
npm run monitor:dry
```

`fixtures/posts.json` contains synthetic examples only and must not be treated as real announcements.

```bash
TARGET_TIMEZONE=America/New_York npm run monitor:dry
npm run monitor:dry -- --input /path/to/posts.json
```

The input is an `XPost[]` array with fields matching the fixture: `id`, `text`, timezone-aware `createdAt`, `url`, and `media`.

## GitHub Actions

1. Enable workflows on the fork's **Actions** page.
2. Optional: configure external notification channels under **Settings → Secrets and variables → Actions**. FxEmbed does not require `X_BEARER_TOKEN`, and no notification secret is required if you only want to verify the monitor in GitHub Actions.
3. Set `TARGET_TIMEZONE` under Variables if needed. It defaults to `Asia/Shanghai`.
4. After the code is on `main`, manually run **Monitor X for reset** once to establish the initial cursor.
5. Open that workflow run's **Summary**. Every run publishes its monitor status there; reset signals are also rendered directly in the Job Summary.
6. Set `MONITOR_ENABLED=true` under Variables to enable the roughly five-minute schedule. Set it back to `false` to pause scheduled checks.

GitHub Actions Job Summary is a built-in notification target, so a first run no longer fails merely because Telegram, email, SMS, Discord, or webhook credentials are absent. External channels are optional extensions.

Scheduled runs execute only from `main`. GitHub Actions schedules may be delayed and are not a hard real-time guarantee; inactive repositories may also have schedules disabled by GitHub. Use Docker for a more continuously controlled runtime.

The default `SOURCE_PROVIDER=fxembed` uses a third-party public endpoint and currently needs no paid X API credential. **Zero X API cost does not mean every operating cost is zero**: hosting and notification providers may still charge. This project cannot guarantee FxEmbed availability, freshness, rate limits, or completeness.

Only `SOURCE_PROVIDER=x` selects the official X API and requires an `X_BEARER_TOKEN` with access to the required user and post endpoints. A configured X token is not used as an automatic paid fallback when FxEmbed fails.

### Notification channels

| Channel | Configuration |
| --- | --- |
| GitHub Actions | Automatic Job Summary target; no secret required |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| Generic webhook | `WEBHOOK_URLS`; optional `WEBHOOK_SECRET`, `WEBHOOK_DEBUG` |
| Resend email | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` |
| Twilio SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `SMS_TO` |

Each external channel must be configured completely or left entirely blank. Separate multiple destinations with commas.

Feishu/Lark, WeCom, QQ/NoneBot, Apprise, and similar systems can consume the generic webhook through a small bridge. Their native bot URLs are **not** drop-in generic webhook endpoints because their payload contracts differ. See the [generic webhook contract](docs/webhook.md).

### Configuration

| Environment variable / Actions Variable | Default | Description |
| --- | --- | --- |
| `SOURCE_PROVIDER` | `fxembed` | `fxembed` (no X credential) or `x` (official X API); no automatic fallback |
| `X_USERNAME` | `thsottiaux` | Target account |
| `MATCH_WORD` | `reset` | Enables reset event parsing by default; custom words use whole-word matching |
| `TARGET_TIMEZONE` | `Asia/Shanghai` | Output timezone, for example `Europe/London` |
| `SOURCE_TIMEZONE` | empty | Explicit assumption for source-local clock times, for example `America/Los_Angeles` |
| `INCLUDE_MENTIONS` | `true` | Include requests/discussions/negations that are clearly marked as unconfirmed |
| `X_EXCLUDE_REPLIES` | `false` | Exclude replies authored by the target account |
| `WEBHOOK_DEBUG` | `false` | Log sanitized webhook host/status/timing diagnostics without URL paths or secrets |
| `MONITOR_ENABLED` | disabled | Actions only; `true` enables scheduled runs |
| `BOOTSTRAP_NOTIFY` | `false` | Local only; optionally notify historical items during bootstrap. Actions forces this off |
| `STATE_PATH` | `data/state.json` | Local only; Actions uses the default state file |
| `POLL_INTERVAL_SECONDS` | `300` | Used by `--loop`; minimum 60 seconds |

The first run reads a recent page to establish the baseline. Later FxEmbed runs follow `cursor.bottom` until an entire page is no newer than the previous checkpoint or no next page is available. Pagination loops and excessive page counts fail the batch and retry later; collection failures are never treated as “no new posts.”

Switching the same account between `fxembed` and `x` can reuse its numeric user ID, post IDs, and pending outbox. Use a new state file when changing the target account or keyword.

## Cloudflare Workers import

The repository includes `wrangler.jsonc` and a Worker-compatible vinext output entrypoint, so the **dashboard/web UI** can be imported into Cloudflare Workers.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AllenXiao95/codex-reset-signal)

You can also use the Cloudflare dashboard and choose **Workers & Pages → Create → Import a repository**, then connect this repository. Recommended build settings:

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

Validate the Worker bundle locally without deploying:

```bash
npm ci
npm run build
npm run cloudflare:dry-run
```

Deploy manually with Wrangler:

```bash
npm run deploy:cloudflare
```

**Scope:** this deploys the dashboard/web application only. It does not move `monitor.yml`, scheduled collection, outbound notifications, or `data/state.json` persistence into Workers. Monitoring still runs through GitHub Actions or Docker, and the deployed dashboard represents the state snapshot present at build time. Keeping those responsibilities separate avoids introducing a second KV/D1 state model merely for dashboard hosting.

## Generic webhook debugging

Put one or more real HTTPS destinations in `WEBHOOK_URLS`, then run:

```bash
WEBHOOK_DEBUG=true npm run webhook:debug
```

The debug command uses synthetic data from `fixtures/posts.json`. It **does not contact X/FxEmbed or read/write monitor state, but it does send a real POST to every configured generic webhook**. A custom fixture can be supplied with:

```bash
WEBHOOK_DEBUG=true npm run webhook:debug -- --input /path/to/posts.json
```

Logs contain only the destination hostname, a short delivery-ID prefix, signing state, successful HTTP status, and elapsed time. They never include URL paths/query strings, secrets, headers, or provider response bodies. See [docs/webhook.md](docs/webhook.md) for the payload schema, HMAC verification, idempotency rules, and debugging checklist.

## Time parsing boundaries

| Source text | Result |
| --- | --- |
| `in two hours` | post publication time + 2 hours |
| `within the next hour` / `in the next hour` | window from publication time through one hour later |
| `September 10, 2026 at 5pm PT` | interpreted using `America/Los_Angeles` and DST on the event date |
| `tomorrow at 5pm` | unknown without a source timezone; explicitly marked as an assumption if `SOURCE_TIMEZONE` is configured |
| `September 10 PT` | date range; no fabricated exact clock time |
| `bank ... valid for 24 hours` | expiry duration is retained separately; no exact expiry is invented when the start is ambiguous |
| `we have reset ...` | completed announcement; publication time may be shown as an observed time, not a verified account-credit time |
| `soon` / multiple ambiguous times | retains source evidence and marks the time unresolved |

The rule engine uses chrono-node for time candidates and Luxon for timezone conversion; it does not call an LLM. It is not a general language-understanding system. Complex conditionals, metaphors, cross-post replies containing only a time, times embedded in images, edits, deletions, and account-specific credit state are not fully solved. Alerts always retain the original post link for verification.

## Local and Docker

```bash
cp .env.example .env
# Configure at least one external target for a normal local monitor run.
npm run monitor
npm run monitor:loop
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

Docker persists state in a named volume. Do not run independent Actions and Docker instances against the same recipients unless you accept duplicate notifications. Do not delete the state volume merely to upgrade.

## Delivery semantics and recovery

- Each candidate notification is persisted to the outbox before outbound delivery; each successful target is checkpointed immediately.
- Restarting retries only unfinished targets. Persisted pending deliveries are still attempted when the post source is temporarily unavailable.
- Target identifiers are hashed. State stores no token, email address, phone number, or webhook URL, but it does contain public post text.
- Delivery is **at least once**. A lost response, a crash between provider acceptance and local checkpointing, or a failed Actions state push can still cause duplicates. Generic webhook consumers should deduplicate by `delivery_id`.
- Actions attempts to persist checkpoints even after a notification failure. If Git persistence fails, `monitor-state-recovery` is uploaded as an artifact.
- All failed targets are attempted once per run and retried later. There is no cross-provider exactly-once guarantee or hard real-time SLA.

## Validation and research

```bash
npm test
npm run typecheck
npm run build
npm run cloudflare:dry-run
```

Tests use mocked HTTP and temporary state files and do not send real notifications. See [research notes](docs/research.md) for the reuse/design scope and [FxEmbed source notes](docs/fxembed.md) for API behavior and failure boundaries.

## License

[MIT](LICENSE). The upstream copyright notice is preserved, and added dependencies retain their respective licenses.
