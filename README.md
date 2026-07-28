# Reset Signal

监听 [@thsottiaux](https://x.com/thsottiaux) 的公开推文；当新推文正文出现完整单词 `reset`（忽略大小写）时，通过邮件、短信或两者同时通知。邮件保留正文和图片，短信提供摘要及原推文链接。

![MIT](https://img.shields.io/badge/license-MIT-171714)
![Node](https://img.shields.io/badge/node-%3E%3D20-171714)

## 特性

- 使用 X API v2 官方接口，不抓取或绕过 X 网页登录
- 读取普通推文、Note Tweet 长文和图片/视频预览
- 完整单词匹配：`reset`、`RESET` 会命中，`preset`、`resets` 不会
- Resend 邮件与 Twilio SMS 可任选或同时启用
- `since_id` 游标 + Resend 幂等键，避免重复通知
- GitHub Actions 每 5 分钟执行，无需服务器和数据库
- 首次运行默认只建立游标，不补发历史推文
- 联系方式和 API 密钥仅存放于 GitHub Secrets

## 工作方式

```text
GitHub Actions（每 5 分钟）
        ↓
X API：读取 @thsottiaux 的新推文 + 媒体
        ↓
完整单词匹配：reset（忽略大小写）
        ↓
Resend Email / Twilio SMS
        ↓
提交 data/state.json 游标，下一轮去重
```

## 部署

1. Fork 本仓库。
2. 在 X Developer Portal 创建 Project/App，取得 App-only Bearer Token。
3. 打开仓库的 **Settings → Secrets and variables → Actions**。
4. 添加 `X_BEARER_TOKEN`，并至少配置一种通知方式。
5. 打开 **Actions → Monitor X for reset → Run workflow** 完成首次初始化。

首次运行会记录当前最新推文 ID，但不会对历史内容发送通知。之后 workflow 默认每 5 分钟运行。

### 邮件（Resend）

| Secret | 内容 |
| --- | --- |
| `RESEND_API_KEY` | Resend API Key |
| `EMAIL_FROM` | 已验证域名的发件人，如 `Reset Signal <alerts@example.com>` |
| `EMAIL_TO` | 收件地址；多个地址使用英文逗号分隔 |

### 短信（Twilio）

| Secret | 内容 |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_FROM` | Twilio 发信号码，E.164 格式 |
| `SMS_TO` | 收信号码；多个号码使用英文逗号分隔 |

> Twilio 的试用账户、地区法规和 A2P 注册可能限制短信投递。请先确认发送地区的合规要求。

## 本地运行

```bash
npm install
cp .env.example .env
# 填写 .env
npm run monitor
```

启动说明面板：

```bash
npm run dev
```

验证：

```bash
npm test
npm run typecheck
npm run build
```

## 配置项

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `X_USERNAME` | `thsottiaux` | 目标 X 用户名 |
| `MATCH_WORD` | `reset` | 监听的完整单词 |
| `X_EXCLUDE_REPLIES` | `false` | 是否忽略目标账号发布的回复 |
| `BOOTSTRAP_NOTIFY` | `false` | 首次运行是否通知最近一批历史推文 |
| `STATE_PATH` | `data/state.json` | 去重状态文件 |

不建议在公开仓库中将 `BOOTSTRAP_NOTIFY` 设置为 `true`，除非你明确希望首次运行时发送历史命中。

## API 与成本

本项目需要有权访问以下 X API v2 端点：

- `GET /2/users/by/username/:username`
- `GET /2/users/:id/tweets`

X、Resend 和 Twilio 的套餐、配额与价格可能变化，请以各服务商当前页面为准。GitHub Actions 的定时任务可能有排队延迟，不能保证硬实时。

## 安全与隐私

- 不要把 `.env`、Bearer Token、邮箱或手机号提交到仓库。
- 仓库仅保存公开推文的最近 20 条命中记录和公开 Post ID。
- 邮件 HTML 会转义推文文本，防止内容注入。
- 若将仓库 Fork 为公开仓库，请确认你接受 `data/state.json` 中的公开命中记录可见。

## 开源协议

[MIT](./LICENSE)

仅监控公开内容。使用者须自行遵守 X Developer Agreement、邮件反垃圾规则、短信/电信法规以及目标地区的隐私要求。
