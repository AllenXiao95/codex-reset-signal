# Codex Reset Signal

[English](README.md) | **简体中文**

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)

监控 [Tibo（@thsottiaux）](https://x.com/thsottiaux) 的公开 X 帖子，识别 reset / reset bank / banked reset，解析事件时间，并同时提供主动通知与实时、可切换时区的 Dashboard。

项目基于 [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal) 二次开发，保留上游版权声明和 MIT 协议。项目不是 OpenAI、X 或 Cloudflare 的官方服务。

## 工作方式

```text
Scheduler
  ├─ GitHub Actions schedule
  └─ 可选 Cloudflare Cron → workflow_dispatch
                    ↓
               GitHub Actions
                    ↓
                  FxEmbed
                    ↓
               reset 事件解析
                    │
        ┌───────────┴───────────┐
        │                       │
      检测事实               durable outbox
        │                       │
   public status       GitHub Summary / Telegram /
        │               Discord / Webhook / 邮件 / 短信
        ↓
Cloudflare Dashboard
```

核心语义：

- 默认使用 FxEmbed，不需要 X Token 或 Cookie；官方 X API v2 仍可显式选择。
- **Detection 与 Delivery 解耦**：已经检测到的 reset 会立即进入 Dashboard，即使 Telegram/Webhook 暂时投递失败也不会消失。
- 首次运行会解析最近一页用于 Dashboard，但默认**不补发历史通知**。
- 相对时间以发帖时间为基准；精确时刻、时间窗口、日期、公告观测时刻和无法确认的时间不会被强行归一成一个 timestamp。
- 事件事实统一保存为 UTC；Dashboard 默认自动获取浏览器 IANA 时区，也可手动选择，并保存在 `localStorage`。
- 定时运行状态放到独立 `monitor-state` 分支，不再每五分钟把 `state.json` commit 到 `main`，因此不会额外触发主分支 CI 或 Cloudflare 重部署。
- Dashboard 只读取精简的 `status.json` 公共投影，不暴露 cursor、seen hash、outbox、投递检查点或凭证。

## GitHub Actions 定时监控

1. 在仓库/Fork 中启用 Actions。
2. 手动运行一次 **Monitor X for reset** 验证配置。
3. 打开运行记录的 **Summary** 查看状态。
4. 约每五分钟一次的 GitHub schedule 默认启用；只有需要关闭 GitHub 自带定时执行时才设置仓库变量 `MONITOR_ENABLED=false`。手动 `workflow_dispatch` 不受影响。
5. Telegram、Discord、Webhook、邮件或短信 Secret 均可后续按需配置。

如果改用 Cloudflare Cron 负责调度，应把 `MONITOR_ENABLED=false` 设置为 **GitHub Repository Actions Variable**，让 Cloudflare 只负责触发 `workflow_dispatch`。完整配置见 [docs/cloudflare.md](docs/cloudflare.md)。

工作流会同时 checkout 两个分支：

```text
main
  源代码 + workflow + dashboard

monitor-state
  state.json   # cursor / seen / outbox / delivery checkpoint
  status.json  # Dashboard 公共投影
```

因此 `main` 不再出现高频状态 commit。GitHub Actions 的 schedule 可能延迟，不提供严格实时 SLA。

### 通知渠道

| 渠道 | 配置 |
| --- | --- |
| GitHub Actions | Job Summary，自动启用，无 Secret |
| Telegram | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| 通用 Webhook | `WEBHOOK_URLS`；可选 `WEBHOOK_SECRET`、`WEBHOOK_DEBUG` |
| Resend 邮件 | `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO` |
| Twilio 短信 | `TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM`、`SMS_TO` |

每种外部通知要么完整配置，要么全部留空。Webhook 协议和调试方式见 [docs/webhook.md](docs/webhook.md)。

## 实时 Dashboard

首页优先回答实际使用问题：**最新 reset 是什么时候？**

页面展示：

- 最新 reset 的事件时间和状态；
- 最新 bank credit / bank expiry；
- 原始证据文本和 X 原帖链接；
- 浏览器自动时区或手动 IANA 时区；
- 对未来精确时刻显示倒计时；
- Monitor 健康状态：`Healthy` / `Delayed` / `Stale` / `Degraded`；
- 最近检测到的 signals，且不受通知投递结果影响。

健康状态会同时考虑 `lastRunStatus` 和 `lastCheckedAt` 新鲜度，不会因为历史上“运行过一次”就永久显示 Active。

### Public Status 数据

Dashboard 读取 `monitor-state/status.json`，仅保留公开展示所需字段，例如：

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

检测记录会保留解析后的 `events`、发帖时间、检测时间、原帖链接，以及已成功投递的渠道名；内部 outbox 等状态不进入公共协议。

## Cloudflare Workers

Cloudflare Workers 是当前首选的 Dashboard 托管方式。仓库已包含 `wrangler.jsonc` 和 vinext Worker 入口。

### Dashboard 部署

如果你已经 Fork 了这个项目，或者 GitHub 账号里已经存在 `codex-reset-signal`，应使用 Cloudflare **Workers & Pages → Create application → Import a repository**。不要对已有 Fork 使用 Deploy to Cloudflare 模板按钮，因为它会尝试再创建一个 GitHub/GitLab 仓库，从而可能出现同名仓库冲突。

构建配置：

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

首次部署 Dashboard Worker 不需要填写本项目自己的 Secret。

如果已经有 Cloudflare 域名，建议给 Dashboard 使用独立 **Custom Domain**，例如 `reset.example.com`。同一个 Worker 会同时处理 `/` 和 `/api/status`，因此不需要再给 `/api/status` 单独配置 Worker Route。个人域名也不应写死到 `wrangler.jsonc`，避免 Fork 用户继承。

`RESET_STATUS_URL` 是**可选项**。维护者当前部署默认已经读取 `AllenXiao95/codex-reset-signal` 的 `monitor-state/status.json`，所以只要仓库 owner/name、分支和路径不变，通常无需配置。只有 Fork、仓库改名/迁移、状态文件路径变化或改用其他状态源时才需要覆盖。

### 可选 Cloudflare Cron Scheduler

GitHub 自带 schedule 仍然受支持。如果某个仓库的 GitHub scheduled event 长期不可靠，可以单独创建一个极小的 Cloudflare Scheduler Worker：

```text
Cloudflare Cron
      ↓
GitHub workflow_dispatch
      ↓
monitor.yml
      ↓
FxEmbed → monitor-state
```

Scheduler Worker 只需要：

- Cloudflare Secret：`GITHUB_TOKEN`，对应仅授权目标仓库、具有 GitHub Actions write 权限的 fine-grained token；
- 一个 Cron Trigger，例如 `*/5 * * * *`，或者错峰的五分钟表达式；
- 不需要 Custom Domain；
- 不需要 Worker Route。

当 Cloudflare Cron 成为实际调度时钟后，在 GitHub 仓库中设置：

```text
Settings → Secrets and variables → Actions → Variables

MONITOR_ENABLED=false
```

这里的 `MONITOR_ENABLED` 是 **Repository Actions Variable**，不是 Environment Variable，也不是 Secret。它只关闭 GitHub 自己的 schedule；手动和 Cloudflare 触发的 `workflow_dispatch` 仍然可用。

完整的 Dashboard 域名、Worker 路由、Cron、Token 权限、变量类型和验证步骤见 **[docs/cloudflare.md](docs/cloudflare.md)**。

### Deploy Button：仅适用于还没有自己的仓库

如果你的 GitHub/GitLab 账号里**还没有**这个项目，并且希望 Cloudflare 帮你自动创建一份新的仓库，可以使用模板部署：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AllenXiao95/codex-reset-signal)

仓库根目录 `.env.example` 刻意不包含任何变量赋值，因此模板首次部署不会再要求填写 Telegram、Twilio、Resend 等 monitor 通知参数。完整的本地/Docker monitor 配置已经移动到 `monitor.env.example`。

本地验证：

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run cloudflare:dry-run
```

Worker 的 `/api/status` 会在访问时读取 `monitor-state/status.json`，因此 monitor 更新状态时**不会重新部署网页**。Dashboard 本身不需要 KV、D1、SSE 或 WebSocket。

## GitHub Pages fallback

GitHub Pages 仅作为静态 fallback，不作为第二套运行时后端。Dashboard 客户端在 `/api/status` 不可用时可以退回读取公开的 raw `status.json`。

由于当前 vinext 主构建包含 SSR Worker 入口与 API Route，正式推荐路径仍是 Cloudflare Workers；不为了 Pages 再维护第二套状态系统或后端实现。

## 配置项

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SOURCE_PROVIDER` | `fxembed` | `fxembed` 或官方 `x`；无自动付费回退 |
| `X_USERNAME` | `thsottiaux` | 目标 X 账号 |
| `MATCH_WORD` | `reset` | 默认使用 reset 事件解析；其他词走完整单词匹配 |
| `TARGET_TIMEZONE` | `Asia/Shanghai` | 通知显示时区；Dashboard 自己使用浏览器选择 |
| `SOURCE_TIMEZONE` | 空 | 原文无时区时的显式来源时区假设 |
| `INCLUDE_MENTIONS` | `true` | 保留明确标记为未确认的 reset 讨论/请求 |
| `X_EXCLUDE_REPLIES` | `false` | 是否排除目标账号回复 |
| `MONITOR_ENABLED` | 除非为 `false` 否则启用 | GitHub Repository Actions Variable；设为 `false` 时只关闭 GitHub 自己的 schedule |
| `BOOTSTRAP_NOTIFY` | `false` | 本地历史通知开关；Actions 强制关闭 |
| `STATE_PATH` | `data/state.json` | 本地内部运行时状态路径 |
| `PUBLIC_STATUS_PATH` | 可选 | 公共投影路径；Actions 使用 `runtime/status.json` |
| `RESET_STATUS_URL` | 项目默认状态源 | Cloudflare Dashboard Worker 的可选状态源覆盖；维护者通常无需配置 |
| `WEBHOOK_DEBUG` | `false` | 输出脱敏 hostname/status/耗时信息 |
| `POLL_INTERVAL_SECONDS` | `300` | loop 模式轮询间隔，最小 60 秒 |

## 时间解析边界

| 原文示例 | 结果 |
| --- | --- |
| `in two hours` | 发帖时间 + 2 小时 |
| `within the next hour` | 从发帖时刻开始的一小时时间窗口 |
| `September 10, 2026 at 5pm PT` | 按 `America/Los_Angeles` 和事件日期 DST 换算 |
| `tomorrow at 5pm` | 无明确/配置来源时区时保持未确认 |
| `September 10 PT` | 日期范围，不伪造精确时刻 |
| `bank ... valid for 24 hours` | 单独保留有效期证据；起算点不明时不推算到期时刻 |
| `we have reset ...` | 已完成公告；必要时使用发帖时间作为 observed time，而非账户实际到账时刻 |
| `soon` / 多个冲突时间 | 保留证据并标记未确定 |

规则引擎使用 chrono-node + Luxon，不调用 LLM。复杂条件句、图片内时间、跨帖上下文、编辑/删除、以及用户账户实际到账时间仍不保证完整处理。

## 通用 Webhook 调试

```bash
WEBHOOK_DEBUG=true npm run webhook:debug
```

该命令使用合成 fixture，不访问 X/FxEmbed，也不修改 monitor state，但**会真实 POST 到配置的 `WEBHOOK_URLS`**。日志不会打印 URL path/query、凭证、Header 或响应正文。

## 本地 / Docker

```bash
cp monitor.env.example .env
npm run monitor
npm run monitor:loop
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

Docker 使用自己的命名卷保存状态。不要让 Actions 和 Docker 两个独立实例同时对同一接收者发送通知，除非接受重复投递风险。

## 投递与恢复语义

- 检测事实先持久化，并立即可以进入 Public Status。
- 通知任务发送前先进入 durable outbox。
- 每个成功目标单独 checkpoint；失败目标后续重试。
- 仍然是 **at-least-once**，不是 exactly-once；Webhook 接收方应使用 `delivery_id` 去重。
- 如果 Actions 无法写回独立 runtime 分支，会上传 `monitor-state-recovery`，其中包含 `state.json` 与 `status.json`。

## License

[MIT](LICENSE)。保留上游版权声明。
