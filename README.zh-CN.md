# Codex Reset Signal

[English](README.md) | **简体中文**

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)

**在线 Dashboard：** [https://reset.onlyax.com/](https://reset.onlyax.com/)

监控 [Tibo（@thsottiaux）](https://x.com/thsottiaux) 的公开 X 帖子，识别 reset / reset bank 信号、解析事件时间，并提供可切换时区的 Dashboard 和可选通知。

项目基于 [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal) 二次开发，保留上游版权声明和 MIT 协议。项目不是 OpenAI、X 或 Cloudflare 的官方服务。

## 工作方式

```text
GitHub schedule
或 Cloudflare Cron → workflow_dispatch
                ↓
           GitHub Actions
                ↓
              FxEmbed
                ↓
           reset 事件解析
         ├─ public status → monitor-state/status.json → Dashboard
         └─ outbox → GitHub Summary / Telegram / Discord / Webhook / 邮件 / 短信
```

- 默认使用 FxEmbed，不需要 X API Token 或 Cookie。
- Detection 与 Delivery 解耦；通知失败不会隐藏已经检测到的 signal。
- 事件时间统一保存为 UTC，展示时再转换时区。
- 运行时状态保存在独立 `monitor-state` 分支，不污染 `main`。
- Dashboard **仅在页面可见时每 5 分钟刷新一次**；隐藏标签页停止请求，重新可见后立即刷新。

## 快速开始

### GitHub Actions 监控

1. Fork/Clone 仓库并启用 Actions。
2. 手动运行一次 **Monitor X for reset** 验证。
3. GitHub 内置约 5 分钟 schedule 默认启用；设置仓库变量 `MONITOR_ENABLED=false` 后关闭。
4. 仅为实际使用的通知渠道配置 Secret。

监控状态写入：

```text
monitor-state/
├─ state.json   # cursor / seen / outbox / delivery checkpoint
└─ status.json  # Dashboard 公共状态
```

### Cloudflare Dashboard

已有 GitHub 仓库时，使用 **Workers & Pages → Create application → Import a repository**。

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

Dashboard 建议绑定独立 Custom Domain。当前维护者部署：

```text
https://reset.onlyax.com/
```

`RESET_STATUS_URL` 是可选项；当前默认已经读取本仓库 `monitor-state/status.json`。

### 可选 Cloudflare Scheduler

如果 GitHub schedule 不可靠，可以部署独立 Scheduler Worker：

```bash
npm run deploy:cloudflare:scheduler
```

只需要 Cloudflare Secret `GITHUB_TOKEN`，权限限制到当前仓库并允许 GitHub Actions write。

当 Cloudflare Cron 负责调度时，在 GitHub 设置 Repository Actions Variable：

```text
MONITOR_ENABLED=false
```

这样只关闭 GitHub 自带 schedule，手动和 Cloudflare 触发的 `workflow_dispatch` 仍可运行。

完整说明：[docs/cloudflare.md](docs/cloudflare.md)

## 通知渠道

| 渠道 | 配置 |
| --- | --- |
| GitHub Actions | 内置 Job Summary |
| Telegram | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| Webhook | `WEBHOOK_URLS`；可选 `WEBHOOK_SECRET` |
| Resend 邮件 | `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO` |
| Twilio 短信 | `TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM`、`SMS_TO` |

Webhook 说明：[docs/webhook.md](docs/webhook.md)

## 本地 / Docker

```bash
cp monitor.env.example .env
npm run monitor
# 或
npm run monitor:loop
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

常用默认值：

| 变量 | 默认值 |
| --- | --- |
| `SOURCE_PROVIDER` | `fxembed` |
| `X_USERNAME` | `thsottiaux` |
| `MATCH_WORD` | `reset` |
| `TARGET_TIMEZONE` | `Asia/Shanghai` |
| `POLL_INTERVAL_SECONDS` | `300` |

时间解析会区分精确时刻、时间窗口、日期、公告观测时间和无法确认的时间，不会强行伪造单一 timestamp。

## 验证

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run cloudflare:dry-run
npm run cloudflare:scheduler:dry-run
```

## License

[MIT](LICENSE)。保留上游版权声明。
