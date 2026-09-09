# Codex Reset Signal

监控 [Tibo（@thsottiaux）](https://x.com/thsottiaux) 的公开 X 帖子，识别 reset / reset bank / banked reset，提取事件时间并转换为指定时区，通过机器人、邮件或短信通知。

基于 [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal) 二次开发，保留 MIT 协议和上游版权声明。项目不是 OpenAI 或 X 的官方服务。

## 首版能力

- 官方 X API v2 获取普通帖、回复和 Note Tweet 长文；不包含转帖。
- 区分额度重置、bank 发放、bank 有效期与未确认的相关讨论。
- 相对时间以**发帖时间**为基准；支持英文日期、明确时区、太平洋夏令时、时间窗口。
- 目标时区使用 IANA 名称，默认 `Asia/Shanghai`；无来源时区时不擅自补齐。
- Telegram、Discord、通用 JSON Webhook、Resend 邮件、Twilio 短信。
- 完整分页、持久化待发队列、逐目标投递检查点、单进程锁。
- 首次运行只建立游标；离线样例演示不联网、不发送消息、不修改状态。

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

## GitHub Actions 部署

1. 在 Fork 的 Actions 页面启用工作流。
2. 在 Settings → Secrets and variables → Actions → Secrets 配置 `X_BEARER_TOKEN`，并至少配置一个通知渠道。
3. 在 Variables 中配置 `TARGET_TIMEZONE`，不填默认为 `Asia/Shanghai`。
4. 将代码合并到 `main` 后，手动运行 **Monitor X for reset**，完成首次初始化。
5. 在 Variables 中设置 `MONITOR_ENABLED=true`，开启约每五分钟一次的定时检查；改为 `false` 可暂停定时检查。

定时任务只运行于 `main`。Actions 可能延迟，不能保证精确每五分钟；长期无仓库活动也可能被 GitHub 停用。需要更稳定的持续运行时，使用 Docker。

X Token 必须能够调用 `GET /2/users/by/username/:username` 和 `GET /2/users/:id/tweets`。**开源代码不等于免费 X 数据源**：接口权限、配额和收费以 X 当前规则为准。本项目不会自动购买服务或兑换任何账号的 reset。

### 通知渠道 Secrets

每组必须完整配置；不使用的组全部留空。多个目标用英文逗号分隔。

| 渠道 | Secrets |
| --- | --- |
| Telegram | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_IDS` |
| Discord | `DISCORD_WEBHOOK_URLS` |
| 通用 Webhook | `WEBHOOK_URLS`；可选 `WEBHOOK_SECRET` |
| Resend 邮件 | `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO` |
| Twilio 短信 | `TWILIO_ACCOUNT_SID`、`TWILIO_AUTH_TOKEN`、`TWILIO_FROM`、`SMS_TO` |

Telegram 的接收者需要先启动机器人，或把机器人添加到有发送权限的群组。Discord 使用频道的 incoming webhook。这里只实现出站通知，不实现聊天指令或用户订阅管理。

飞书、企微、QQ / NoneBot 等可由自己的中转服务消费通用 Webhook；**不能直接把这些平台的原生机器人 URL 当成通用 Webhook**，它们需要各自的 payload 转换。参见 [Webhook 接入约定](docs/webhook.md)。

### 配置项

| 环境变量 / Actions Variable | 默认值 | 说明 |
| --- | --- | --- |
| `X_USERNAME` | `thsottiaux` | 目标账号 |
| `MATCH_WORD` | `reset` | 默认启用 reset 事件解析；自定义词使用完整单词匹配 |
| `TARGET_TIMEZONE` | `Asia/Shanghai` | 通知显示时区，如 `Europe/London` |
| `SOURCE_TIMEZONE` | 空 | 无原文时区时的显式假设，如 `America/Los_Angeles`；通知会标明假设 |
| `INCLUDE_MENTIONS` | `true` | 是否发送明确标记为未确认的请求、讨论、否定等相关内容；设 `false` 只接收规则判定的事件 |
| `X_EXCLUDE_REPLIES` | `false` | 是否排除目标账号自己的回复 |
| `MONITOR_ENABLED` | 未启用 | 仅 Actions 使用，`true` 开启定时运行 |
| `BOOTSTRAP_NOTIFY` | `false` | 仅本地支持主动补发首批历史内容；Actions 固定关闭 |
| `STATE_PATH` | `data/state.json` | 仅本地；Actions 固定使用默认文件 |
| `POLL_INTERVAL_SECONDS` | `300` | 仅 `--loop` 使用，最小 60 秒 |

首次仅处理最近一页用于建立基线。初始化之后，所有新帖子分页获取完成，才会把游标与待发队列一起保存。更换账号或关键词时需要新状态文件，防止混用旧游标。

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
# 在 .env 中填入 X Token 和至少一个通知目标
npm run monitor        # 单次检查，自动读取 .env
npm run monitor:loop   # 持续运行
```

```bash
docker compose up -d --build
docker compose logs -f monitor
```

Docker 使用命名卷持久化状态。不要同时在 Actions 和 Docker 中向相同接收者运行两套独立状态的实例，否则会收到重复消息。不要删除状态卷来升级。

异常强制终止可能留下 `state.json.lock`。只有确认没有活跃进程后，才可删除锁文件并重启；程序不会自动抢占未知状态的锁。

## 投递语义与故障恢复

- 每条候选通知先写入 outbox，再向目标发送；成功后立即保存该目标的检查点。
- 重启只重试未成功的目标。X 暂时不可用时，仍尝试投递已持久化的待发通知。
- 目标标识经过哈希；状态文件不存 Token、邮箱、手机号或 Webhook URL，但包含公开帖子的内容。公开仓库中的状态文件同样公开。
- 同一帖子及内容版本去重；如果 API 返回编辑版本，会重新判断。仅使用 `since_id` 不能保证发现所有旧帖编辑或删除。
- 这是 **at-least-once** 投递：远端已收到但响应丢失、进程在响应后落盘前退出、Actions 保存状态失败，都仍可能造成重复。通用 Webhook 接收端应按 `delivery_id` 去重。Resend 另有服务商幂等键与其有效期限制。
- Actions 即使通知步骤失败也会提交检查点；Git 保存失败时上传 `monitor-state-recovery` artifact。此时先暂停监控、恢复该状态到 `data/state.json`，再恢复运行，避免已投递消息重发。
- 改掉一个仍有待发消息的通知目标时，旧任务会保持待处理并报错；请恢复旧配置或在备份后明确移除该任务，程序不静默丢弃。
- 同一轮所有失败目标都尝试一次，下一轮按轮询间隔重试。没有承诺跨服务商的 exactly-once 或实时 SLA。

原有网页作为静态说明和仓库状态快照保留；它不是后台调度器，状态也不会因打开网页而自动刷新。运行监控使用上述 Actions 或 Docker。

## 验证与研究

```bash
npm test
npm run typecheck
npm run build
```

测试通过模拟 HTTP 与临时状态文件验证，不会发送真实消息。[选型记录](docs/research.md) 说明为什么复用上游以及首版范围。

## License

[MIT](LICENSE)。上游版权声明完整保留。新增依赖保留各自的许可证。
