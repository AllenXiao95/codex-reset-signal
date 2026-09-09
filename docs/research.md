# 开源选型记录（2026-09-09）

目标：监控 @thsottiaux 的 reset / reset bank 公告，解析原文时间，以指定时区向多种机器人通知。

| 候选 | 调研判断 |
| --- | --- |
| [UynajGI/reset-signal](https://github.com/UynajGI/reset-signal) | MIT；已有 X v2、邮件、短信与 Actions。选择作为基础，保留署名；补时间解析和可靠投递。 |
| [gvm1229/codex-reset-monitor](https://github.com/gvm1229/codex-reset-monitor) | README 描述了 bank、相对时间和 Pacific DST，但检查时未找到许可证；没有复制其代码。 |
| [Dwade8128/tibo-reset-monitor](https://github.com/Dwade8128/tibo-reset-monitor) | MIT；Nitter + Workers/D1 + 网站订阅，比单账号通知所需的部署范围更大。 |
| [orange90/tibo_reset_reminder_skill](https://github.com/orange90/tibo_reset_reminder_skill) | 公共 Feed + Agent Skill；依赖外部托管 Feed，README 明确尚未声明许可证；没有复制其代码。 |
| [RZX00/tibo-reset-radar](https://github.com/RZX00/tibo-reset-radar) | Apache-2.0；偏预测与可视化，超出首版通知范围。 |

源码审查发现，上游只读取一页、没有逐目标投递检查点，而且 README 所述定时触发与实际 workflow 不一致。首版针对这些已确认问题改造，不引入预测模型、账号额度读取或多用户订阅系统。

复用组件：

- [chrono-node](https://github.com/wanasit/chrono)：MIT，自然语言时间候选提取。
- [Luxon](https://github.com/moment/luxon)：MIT，IANA 时区和 DST 换算。
- [Apprise API](https://github.com/caronc/apprise-api)：后续多渠道扩展候选，首版可以通过自行部署的桥接服务接入，尚未原生集成。

接口参考：

- [X user posts](https://docs.x.com/x-api/users/get-posts)
- [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage)
- [Discord execute webhook](https://docs.discord.com/developers/resources/webhook#execute-webhook)

首版验收使用模拟接口、合成帖子和临时状态文件。它验证程序行为，不代表已经验证真实 X 凭证、配额、机器人权限或线上连续运行。
