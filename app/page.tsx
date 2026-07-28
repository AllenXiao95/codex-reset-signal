import { readFile } from "node:fs/promises";
import path from "node:path";
import type { MonitorState } from "@/src/types";

const fallbackState: MonitorState = {
  username: "thsottiaux",
  keyword: "reset",
  userId: null,
  sinceId: null,
  lastCheckedAt: null,
  lastRunStatus: "waiting-for-first-run",
  postsScanned: 0,
  matches: [],
};

async function getState(): Promise<MonitorState> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "data/state.json"), "utf8"),
    ) as MonitorState;
  } catch {
    return fallbackState;
  }
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 13 13 3M5 3h8v8" />
    </svg>
  );
}

function ChannelIcon({ kind }: { kind: "email" | "sms" }) {
  return kind === "email" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5h18v12H3zM3.5 7l8.5 7 8.5-7" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 2.5h10a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2ZM10 18.5h4" />
    </svg>
  );
}

export default async function Home() {
  const state = await getState();
  const active = Boolean(state.lastCheckedAt);
  const checkedAt = state.lastCheckedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }).format(new Date(state.lastCheckedAt))
    : "等待首次运行";

  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#top" aria-label="Reset Signal home">
          <span className="brandMark"><i /><i /><i /></span>
          <span>RESET SIGNAL</span>
        </a>
        <nav>
          <a href="#how">工作方式</a>
          <a href="#setup">部署</a>
          <a
            className="githubLink"
            href="https://github.com/UynajGI/reset-signal"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowIcon />
          </a>
        </nav>
      </header>

      <section className="hero shell" id="top">
        <div className="heroCopy">
          <div className={`eyebrow ${active ? "isActive" : ""}`}>
            <span className="pulse" />
            {active ? "MONITOR ACTIVE" : "READY TO CONFIGURE"}
          </div>
          <h1>
            当 <span>reset</span>
            <br />
            出现，第一时间知道。
          </h1>
          <p className="lede">
            持续监听 <strong>@thsottiaux</strong> 的公开推文。命中关键词后，
            将正文、图片与原文链接直接送达你的邮箱或手机。
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="#setup">
              开始部署 <ArrowIcon />
            </a>
            <a
              className="textButton"
              href="https://github.com/UynajGI/reset-signal"
              target="_blank"
              rel="noreferrer"
            >
              查看源代码
            </a>
          </div>
        </div>

        <div className="signalCard">
          <div className="signalTop">
            <div>
              <span className="kicker">LIVE TARGET</span>
              <h2>@thsottiaux</h2>
            </div>
            <span className="xBadge">𝕏</span>
          </div>
          <div className="scanLine">
            <div className="waveform" aria-hidden="true">
              {[10, 18, 7, 28, 13, 38, 18, 48, 24, 34, 12, 27, 8, 20].map(
                (height, index) => (
                  <i key={index} style={{ height }} />
                ),
              )}
            </div>
            <div className="keywordLock">
              <span>KEYWORD</span>
              <strong>reset</strong>
            </div>
          </div>
          <div className="signalMeta">
            <div><span>频率</span><strong>每 5 分钟</strong></div>
            <div><span>匹配</span><strong>完整单词 · 忽略大小写</strong></div>
            <div><span>状态</span><strong>{active ? "正常运行" : "等待密钥"}</strong></div>
          </div>
          <div className="deliveryRow">
            <span>DELIVER VIA</span>
            <div>
              <span className="channel"><ChannelIcon kind="email" /> EMAIL</span>
              <span className="channel"><ChannelIcon kind="sms" /> SMS</span>
            </div>
          </div>
        </div>
      </section>

      <section className="metrics shell">
        <div>
          <span className="metricValue">{state.postsScanned}</span>
          <span className="metricLabel">累计扫描推文</span>
        </div>
        <div>
          <span className="metricValue">{state.matches.length}</span>
          <span className="metricLabel">保留命中记录</span>
        </div>
        <div>
          <span className="metricValue">1×</span>
          <span className="metricLabel">每条仅通知一次</span>
        </div>
        <div>
          <span className="metricValue small">{checkedAt}</span>
          <span className="metricLabel">最后检查（北京时间）</span>
        </div>
      </section>

      <section className="workflow shell" id="how">
        <div className="sectionHeading">
          <span>01 / HOW IT WORKS</span>
          <h2>少一点噪音，<br />多一点确定性。</h2>
        </div>
        <div className="steps">
          <article>
            <span className="stepNumber">01</span>
            <div className="stepIcon">⌁</div>
            <h3>读取公开内容</h3>
            <p>通过 X API 拉取新推文，同时解析正文、长文文本、图片与视频预览。</p>
          </article>
          <article>
            <span className="stepNumber">02</span>
            <div className="stepIcon keywordIcon">R</div>
            <h3>精确识别 reset</h3>
            <p>大小写不敏感的完整单词匹配；不会把 “preset” 或 “resets” 当作命中。</p>
          </article>
          <article>
            <span className="stepNumber">03</span>
            <div className="stepIcon">↗</div>
            <h3>即时送达</h3>
            <p>邮件包含图文卡片；短信包含精简摘要和直达原推文的链接。</p>
          </article>
        </div>
      </section>

      <section className="setup shell" id="setup">
        <div className="setupIntro">
          <span className="sectionLabel">02 / DEPLOY</span>
          <h2>Fork. Add secrets. Listen.</h2>
          <p>
            这是一个 MIT 开源项目。运行依赖 GitHub Actions，不需要服务器或数据库。
            私密联系人和 API 密钥始终保存在 GitHub Secrets 中。
          </p>
          <a
            className="primaryButton light"
            href="https://github.com/UynajGI/reset-signal#部署"
            target="_blank"
            rel="noreferrer"
          >
            打开部署指南 <ArrowIcon />
          </a>
        </div>
        <div className="secretList">
          <div className="secretGroup">
            <div className="secretHead"><span>必需</span><em>01</em></div>
            <code>X_BEARER_TOKEN</code>
            <p>来自 X Developer Portal 的 App-only Bearer Token。</p>
          </div>
          <div className="secretGroup">
            <div className="secretHead"><span>邮件</span><em>02</em></div>
            <code>RESEND_API_KEY</code>
            <code>EMAIL_FROM</code>
            <code>EMAIL_TO</code>
          </div>
          <div className="secretGroup">
            <div className="secretHead"><span>短信</span><em>03</em></div>
            <code>TWILIO_ACCOUNT_SID</code>
            <code>TWILIO_AUTH_TOKEN</code>
            <code>TWILIO_FROM</code>
            <code>SMS_TO</code>
          </div>
        </div>
      </section>

      <section className="history shell">
        <div className="historyHead">
          <div>
            <span className="sectionLabel">03 / SIGNAL LOG</span>
            <h2>最近命中</h2>
          </div>
          <span className="privacyNote">仅保存最近 20 条公开推文</span>
        </div>
        {state.matches.length ? (
          <div className="matchList">
            {state.matches.slice(0, 5).map((match) => (
              <a href={match.url} target="_blank" rel="noreferrer" key={match.id}>
                <time>{match.createdAt?.slice(0, 10) || "—"}</time>
                <p>{match.text}</p>
                <span>{match.channels.join(" + ")} <ArrowIcon /></span>
              </a>
            ))}
          </div>
        ) : (
          <div className="emptyState">
            <div className="emptyRadar"><i /><i /><span /></div>
            <div>
              <strong>还没有信号。</strong>
              <p>完成 Secrets 配置并手动运行一次 Monitor workflow 后，这里会显示命中历史。</p>
            </div>
          </div>
        )}
      </section>

      <footer className="shell">
        <a className="brand" href="#top">
          <span className="brandMark"><i /><i /><i /></span>
          <span>RESET SIGNAL</span>
        </a>
        <p>Built for signal, not surveillance. 使用官方 API，仅处理公开内容。</p>
        <a
          href="https://github.com/UynajGI/reset-signal"
          target="_blank"
          rel="noreferrer"
        >
          MIT LICENSE <ArrowIcon />
        </a>
      </footer>
    </main>
  );
}
