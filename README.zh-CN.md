# Codex Reset Signal

[English](README.md) | **简体中文**

[![CI](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/ci.yml)
[![Monitor](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml/badge.svg)](https://github.com/AllenXiao95/codex-reset-signal/actions/workflows/monitor.yml)
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AllenXiao95/codex-reset-signal)

监控 [Tibo（@thsottiaux）](https://x.com/thsottiaux) 的公开 X 帖子，识别 reset / reset bank / banked reset，提取事件时间并转换为指定时区，通过 GitHub Actions 看板、机器人、Webhook、邮件或短信通知。

基于 [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal) 二次开发，保留 MIT 协议和上游版权声明。项目不是 OpenAI、X 或 Cloudflare 的官方服务。

## 主要能力

- 默认通过 FxEmbed 公开 JSON API 获取普通帖、回复和长文，无需 X Token 或 Cookie；官方 X API v2 作为显式可选数据源。
- 按数字作者 ID 过滤时间线中的其他人、排除纯转帖；仅解析原帖正文，不拼接引用帖或对话上下文。
- 区分额度重置、bank 发放、bank 有效期与未确认的相关讨论。
- 相对时间以**发帖时间**为基准；支持英文日期、明确时区、太平洋夏令时、时间窗口。
- 目标时区使用 IANA 名称，默认 `Asia/Shanghai`；无来源时区时不擅自补齐。
- GitHub Actions Job Summary、Telegram、Discord、通用 JSON Webhook、Resend 邮件、Twilio 短信。
- 分页获取新增内容、持久化待发队列、逐目标投递检查点、单进程锁。
- 首次运行只建立游标；离线样例演示不联网、不发送消息、不修改状态。
- Dashboard 可直接导入 Cloudflare Workers；监控任务本身仍由 GitHub Actions 或 Docker 运行。

## 先离线验证

需要 Node.js 22 或更新版本：

```bash
npm ci
npm run monitor:dry
```

内置 `fixtures/posts.json` 全部是合成示例，不能当作真实公告。

```bash
TARGET_TIMEZONE=America/New_York npm run monitor:dry
npm run monitor:dry -- --input /path/to/posts.json
```

输入格式为 `XPost[]`，字段与示例一致：`id`、`text`、带时区的 `createdAt`、`url`、`media`。

## GitHub Actions

1. 在 Fork 的 Actions 页面启用工作流。
2. 可选：在 **Settings → Secrets and variables → Actions** 配置外部通知渠道。默认 FxEmbed 不需要 `X_BEARER_TOKEN`，只想先验证监控时也不需要任何通知 Secret。
3. 在 Variables 中配置 `TARGET_TIMEZONE`，不填默认为 `Asia/Shanghai`。
4. 合并到 `main` 后，手动运行 **Monitor X for reset** 完成首次初始化。
5. 直接打开该 Workflow Run 的 **Summary**：每轮状态会显示在 Job Summary；若发现 reset 信号，通知正文也会直接显示在这里。
6. 在 Variables 中设置 `MONITOR_ENABLED=true`，开启约每五分钟一次的定时检查；改为 `false` 可暂停。

GitHub Actions Job Summary 是内建通知目标，因此首次运行不会再因为“没有配置邮件/短信/机器人/Webhook”而失败。外部渠道全部是可选增强。

定时任务只运行于 `main`。Actions 可能延迟，不能保证精确每五分钟；长期无仓库活动也可能被 GitHub 停用。需要更稳定的持续运行时，使用 Docker。

默认 `SOURCE_PROVIDER=fxembed` 使用第三方公开接口，目前无需付费 API 凭证。**零 X API 费用不等于所有运行成本为零**：服务器、通知渠道等可能收费。FxEmbed 没有本项目可承诺的可用性或数据完整性保障，缓存、限流、接口变动都可能造成延迟或遗漏。

只有显式设置 `SOURCE_PROVIDER=x` 才使用官方 X API，并要求 `X_BEARER_TOKEN` 能调用用户与帖子接口。即使已配置 Token，FxEmbed 故障也**不会自动切换到付费接口**。

### 通知渠道

| 渠道 | 配置 |
| --- | --- |
| GitHub Actions | 自动启用；结果显示在 Job Summary，无 Secret |
| Telegram | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| 通用 Webhook | `WEBHOOK_URLS`；可选 `WEBHOOK_SECRET`、`WEBHOOK_DEBUG` |
| Resend 邮件 | `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO` |
| Twilio 短信 | `TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM`、`SMS_TO` |

每组外部渠道必须完整配置；不使用的组全部留空。多个目标用英文逗号分隔。

飞书、企微、QQ / NoneBot 等可由自己的中转服务消费通用 Webhook；**不能直接把这些平台的原生机器人 URL 当成通用 Webhook**，它们需要各自的 payload 转换。参见 [Webhook 接入约定](docs/webhook.md)。

### 配置项

| 环境变量 / Actions Variable | 默认值 | 说明 |
| --- | --- | --- |
| `SOURCE_PROVIDER` | `fxembed` | `fxembed`（无需 X 凭证）或 `x`（官方 API）；无自动回退 |
| `X_USERNAME` | `thsottiaux` | 目标账号 |
| `MATCH_WORD` | `reset` | 默认启用 reset 事件解析；自定义词使用完整单词匹配 |
| `TARGET_TIMEZONE` | `Asia/Shanghai` | 通知显示时区，如 `Europe/London` |
| `SOURCE_TIMEZONE` | 空 | 无原文时区时的显式假设，如 `America/Los_Angeles`；通知会标明假设 |
| `INCLUDE_MENTIONS` | `true` | 是否发送明确标记为未确认的请求、讨论、否定等相关内容 |
| `X_EXCLUDE_REPLIES` | `false` | 是否排除目标账号自己的回复 |
| `WEBHOOK_DEBUG` | `false` | 输出脱敏 Webhook 目标主机、状态码与耗时，不打印路径/密钥 |
| `MONITOR_ENABLED` | 未启用 | 仅 Actions 使用，`true` 开启定时运行 |
| `BOOTSTRAP_NOTIFY` | `false` | 仅本地支持主动补发首批历史内容；Actions 固定关闭 |
| `STATE_PATH` | `data/state.json` | 仅本地；Actions 固定使用默认文件 |
| `POLL_INTERVAL_SECONDS` | `300` | 仅 `--loop` 使用，最小 60 秒 |

首次仅处理最近一页用于建立基线。后续 FxEmbed 沿 `cursor.bottom` 翻页，直到整页帖子均不晚于上次检查点，或服务端不再返回下一页。分页循环或超过安全上限会报错，整批不提交，下一轮重试；不会把抓取失败当成没有新帖。

同一账号在 `fxembed` 与 `x` 之间切换可以沿用数字用户 ID、帖子 ID、待发队列，不需删除状态。更换账号或关键词时使用新状态文件。

## Cloudflare Workers 一键导入 Dashboard

仓库包含 `wrangler.jsonc` 和可部署的 Worker 入口，可把**说明/状态 Dashboard** 直接导入 Cloudflare Workers：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/AllenXiao95/codex-reset-signal)

也可以在 Cloudflare Dashboard 中选择 **Workers & Pages → Create → Import a repository**，连接本仓库。建议构建配置：

```text
Build command:  npm run build
Deploy command: npx wrangler deploy --config wrangler.jsonc
```

本地验证部署包：

```bash
npm ci
npm run build
npm run cloudflare:dry-run
```

手动部署：

```bash
npm run deploy:cloudflare
```

**范围说明：** Cloudflare Workers 部署的是 Dashboard/Web 前端，不承担 `monitor.yml` 的定时抓取、通知和 `data/state.json` 写回。监控执行仍使用 GitHub Actions 或 Docker；Dashboard 展示仓库构建时的状态快照。这样避免在当前版本同时维护 Git、Workers KV/D1 两套状态一致性逻辑。

## 通用 Webhook 调试

在 `.env` 中设置真实的 `WEBHOOK_URLS`，然后：

```bash
WEBHOOK_DEBUG=true npm run webhook:debug
```

该命令使用 `fixtures/posts.json` 的合成数据，**不会访问 X/FxEmbed，也不会读写监控状态，但会向配置的 Webhook 发送真实 POST**。可指定自定义样例：

```bash
WEBHOOK_DEBUG=true npm run webhook:debug -- --input /path/to/posts.json
```

日志只显示目标 hostname、delivery ID 前缀、是否签名、成功 HTTP 状态和耗时；不会打印 URL path/query、Secret、Header 或响应正文。协议、HMAC 校验和排障顺序见 [docs/webhook.md](docs/webhook.md)。

## 时间解析边界

| 原文示例 | 结果 |
| --- | --- |
| `in two hours` | 发帖时间 + 2 小时 |
| `within the next hour` / `in the next hour` | 发帖时刻到一小时后的窗口 |
| `September 10, 2026 at 5pm PT` | 按 `America/Los_Angeles` 在事件日期的夏令时换算 |
| `tomorrow at 5pm` | 未指定来源时区则标记未知；配置 `SOURCE_TIMEZONE` 后明确标记假设 |
| `September 10 PT` | 日期范围，不生成虚假的精确时刻 |
| `bank ... valid for 24 hours` | 单独保存有效期描述；起算点不明确时不推算精确到期时间 |
| `we have reset ...` | 标记已完成；无具体时刻时展示公告发布时间，明确不是账户到账时间 |
| `soon` / 多个无法消歧的时间 | 保留原文，标记时间未确定 |

使用 chrono-node 提取时间候选、Luxon 做时区换算，规则引擎不调用 LLM。它不是通用语言理解系统：复杂条件句、隐喻、只有时间的跨帖回复、图片内时间、撤回与删除尚未完整处理。用户账号的实际到账情况不在监控范围内。通知始终带原帖链接供核对。

## 本地与 Docker

```bash
cp .env.example .env
# 在 .env 中配置通知目标；本地常规 monitor 至少需要一个外部渠道
npm run monitor
npm run monitor:loop
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

Docker 使用命名卷持久化状态。不要同时在 Actions 和 Docker 中向相同接收者运行两套独立状态的实例，否则会收到重复消息。不要删除状态卷来升级。

## 投递语义与故障恢复

- 每条候选通知先写入 outbox，再向目标发送；成功后立即保存该目标的检查点。
- 重启只重试未成功的目标。数据源暂时不可用时，仍尝试投递已持久化的待发通知。
- 目标标识经过哈希；状态文件不存 Token、邮箱、手机号或 Webhook URL，但包含公开帖子的内容。
- 这是 **at-least-once** 投递：远端已收到但响应丢失、进程在响应后落盘前退出、Actions 保存状态失败，都仍可能造成重复。通用 Webhook 接收端应按 `delivery_id` 去重。
- Actions 即使通知步骤失败也会尝试提交检查点；Git 保存失败时上传 `monitor-state-recovery` artifact。
- 同一轮所有失败目标都尝试一次，下一轮按轮询间隔重试。没有承诺跨服务商的 exactly-once 或实时 SLA。

## 验证与研究

```bash
npm test
npm run typecheck
npm run build
npm run cloudflare:dry-run
```

测试通过模拟 HTTP 与临时状态文件验证，不会发送真实消息。[选型记录](docs/research.md) 说明复用上游和范围；[FxEmbed 数据源说明](docs/fxembed.md) 记录接口、故障行为与验证边界。

## License

[MIT](LICENSE)。上游版权声明完整保留。新增依赖保留各自的许可证。
