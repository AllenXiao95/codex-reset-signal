# Codex Reset Signal

[English](README.md) | **简体中文**

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)

**在线 Dashboard：** [https://reset.onlyax.com/](https://reset.onlyax.com/)  
**RSS Feed：** [https://reset.onlyax.com/feed.xml](https://reset.onlyax.com/feed.xml)

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
         ├─ 公共投影
         │    ├─ monitor-state/status.json → Dashboard
         │    └─ monitor-state/feed.xml   → RSS / 自动化系统
         └─ outbox → GitHub Summary / Telegram / Discord / Webhook / 邮件 / 短信
```

- 默认使用 FxEmbed，不需要 X API Token 或 Cookie。
- Detection 与 Delivery 解耦；通知失败不会隐藏已经检测到的 signal。
- 事件时间统一保存为 UTC，展示时再转换时区。
- 运行时状态保存在独立 `monitor-state` 分支，不污染 `main`。
- Dashboard **仅在页面可见时每 5 分钟刷新一次**；隐藏标签页停止请求，重新可见后立即刷新。
- RSS 是 vendor-neutral 的 pull 接口；首版仅包含 `reset` 和 `bank_credit`，明确排除不确定的 `mention` 与 `bank_expiry`。

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
├─ status.json  # Dashboard 公共状态
└─ feed.xml     # reset + bank_credit 的 RSS 2.0 投影
```

即使不部署 Dashboard，也可以直接消费 `monitor-state/feed.xml` 的 raw 文件。

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

同一部署会同时暴露：

```text
https://reset.onlyax.com/feed.xml
```

`RESET_STATUS_URL` 是可选项；当前默认已经读取本仓库 `monitor-state/status.json`。RSS 路由使用同一个公共状态源，因此第三方 fork 只需要把 `RESET_STATUS_URL` 指向自己的运行时分支，Dashboard 与 Feed 会一起切换。

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

## 通知与扩展

| 渠道 | 配置 |
| --- | --- |
| GitHub Actions | 内置 Job Summary |
| Telegram | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| Webhook | `WEBHOOK_URLS`；可选 `WEBHOOK_SECRET` |
| Resend 邮件 | `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO` |
| Twilio 短信 | `TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM`、`SMS_TO` |
| RSS / Atom 消费端 | 订阅 `/feed.xml`；本项目不保存第三方通知平台凭据 |

Webhook 说明：[docs/webhook.md](docs/webhook.md)

### RSS → Server酱 / 方糖 / 其他通知系统

RSS Feed 的目标是避免在本仓库继续累加供应商专用适配。需要方糖时，可以把 Feed 交给 RSSPush 或 Check酱，再在它们那里配置自己的 SendKey：

```text
codex-reset-signal /feed.xml
        ↓
RSSPush / Check酱
        ↓
Server酱 / 方糖
        ↓
微信 / 其他已配置渠道
```

同一个 Feed 也可以自由接入 FreshRSS、Miniflux、n8n、Huginn、IFTTT、Zapier 或自定义 RSS 客户端。若更看重低延迟 push 和明确的 delivery retry，则继续使用已有 Generic Webhook。

Feed 语义：

- 仅输出 `reset` 和 `bank_credit`；
- 每个 `(post.id, event.type)` 对应一个 item；
- GUID 固定为 `post.id:event.type`，避免 parser migration / reprojection 产生重复逻辑通知；
- 有原帖时间时使用 `postCreatedAt` 作为 `pubDate`；
- 每个 item 都链接回原始 X 帖子。

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