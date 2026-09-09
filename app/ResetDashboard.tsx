"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicSignal, PublicStatus } from "@/src/types";
import type { ResetEvent } from "@/src/events";
import styles from "./dashboard.module.css";

const RAW_STATUS_URL =
  "https://raw.githubusercontent.com/AllenXiao95/codex-reset-signal/monitor-state/status.json";
const STORAGE_KEY = "reset-signal-timezone";
const STATUS_REFRESH_INTERVAL_MS = 300_000;

const commonZones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
];

type TimedSignalEvent = {
  signal: PublicSignal;
  event: ResetEvent;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 13 13 3M5 3h8v8" />
    </svg>
  );
}

function formatMoment(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
    timeZoneName: "short",
  })
    .format(date)
    .replace(/\bGMT\b/g, "UTC");
}

function formatDate(iso: string | null, timezone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(iso));
}

function eventFor(
  signal: PublicSignal | null,
  type: ResetEvent["type"],
): ResetEvent | null {
  return signal?.events.find((event) => event.type === type) ?? null;
}

function displayEventTime(event: ResetEvent | null, timezone: string): string {
  if (!event) return "No confirmed signal";
  const { time } = event;
  if (!time.start) return "Time not confirmed";
  if (time.kind === "date") return formatDate(time.start, timezone);
  if (time.kind === "window" && time.end)
    return `${formatMoment(time.start, timezone)} – ${formatMoment(time.end, timezone)}`;
  return formatMoment(time.start, timezone);
}

function countdown(event: ResetEvent | null, now: number): string | null {
  if (
    !event?.time.start ||
    !["exact", "window"].includes(event.time.kind)
  )
    return null;
  const delta = new Date(event.time.start).getTime() - now;
  if (delta <= 0) return null;
  const totalSeconds = Math.max(1, Math.ceil(delta / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const pad = (value: number) => String(value).padStart(2, "0");
  if (days) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (totalHours) return `${totalHours}h ${pad(minutes)}m ${pad(seconds)}s`;
  return `${minutes}m ${pad(seconds)}s`;
}

function lastTimedEvent(
  status: PublicStatus | null,
  type: "reset" | "bank_credit",
  now: number,
): TimedSignalEvent | null {
  if (!status) return null;
  const signals = [
    status.latest.reset,
    status.latest.bankCredit,
    ...status.recent,
  ].filter((signal): signal is PublicSignal => Boolean(signal));
  const seen = new Set<string>();
  const candidates: Array<TimedSignalEvent & { timestamp: number }> = [];
  for (const signal of signals) {
    if (seen.has(signal.version)) continue;
    seen.add(signal.version);
    for (const event of signal.events) {
      if (event.type !== type || !event.time.start) continue;
      const timestamp = new Date(event.time.start).getTime();
      if (!Number.isFinite(timestamp) || timestamp > now) continue;
      candidates.push({ signal, event, timestamp });
    }
  }
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0] ?? null;
}

function health(status: PublicStatus | null, now: number) {
  if (!status?.monitor.lastCheckedAt)
    return { label: "Waiting", className: styles.waiting };
  if (status.monitor.lastRunStatus.startsWith("failed"))
    return { label: "Degraded", className: styles.degraded };
  const ageMinutes =
    (now - new Date(status.monitor.lastCheckedAt).getTime()) / 60_000;
  if (ageMinutes <= 15) return { label: "Healthy", className: styles.healthy };
  if (ageMinutes <= 30) return { label: "Delayed", className: styles.delayed };
  return { label: "Stale", className: styles.degraded };
}

async function loadStatus(signal?: AbortSignal): Promise<PublicStatus> {
  const paths = ["/api/status", `${RAW_STATUS_URL}?_=${Date.now()}`];
  let lastError: unknown;
  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store", signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = (await response.json()) as PublicStatus;
      if (value.schemaVersion !== 1) throw new Error("Unsupported status schema");
      return value;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error("Status unavailable");
}

export default function ResetDashboard() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [autoTimezone, setAutoTimezone] = useState("UTC");
  const [timezoneChoice, setTimezoneChoice] = useState("auto");

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setAutoTimezone(detected);
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setTimezoneChoice(stored);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let disposed = false;

    const stopTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      stopTimer();
      if (!disposed && !document.hidden) {
        timer = window.setTimeout(() => void poll(), STATUS_REFRESH_INTERVAL_MS);
      }
    };

    const refresh = async () => {
      if (disposed || document.hidden) return;
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const nextStatus = await loadStatus(current.signal);
        if (!disposed && !current.signal.aborted) {
          setStatus(nextStatus);
          setError(null);
        }
      } catch (refreshError) {
        if (!disposed && !current.signal.aborted) {
          setError("Live status is temporarily unavailable.");
        }
      } finally {
        if (controller === current) controller = null;
      }
    };

    const poll = async () => {
      await refresh();
      schedule();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopTimer();
        controller?.abort();
        controller = null;
        return;
      }
      void poll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void poll();

    return () => {
      disposed = true;
      stopTimer();
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const timezone = timezoneChoice === "auto" ? autoTimezone : timezoneChoice;
  const timezoneOptions = useMemo(() => {
    const supported = (
      Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    return Array.from(new Set([autoTimezone, ...commonZones, ...(supported ?? [])])).sort();
  }, [autoTimezone]);

  const resetSignal = status?.latest.reset ?? null;
  const resetEvent = eventFor(resetSignal, "reset");
  const bankSignal = status?.latest.bankCredit ?? null;
  const bankEvent = eventFor(bankSignal, "bank_credit");
  const expirySignal = status?.latest.bankExpiry ?? null;
  const expiryEvent = eventFor(expirySignal, "bank_expiry");
  const monitorHealth = health(status, now);
  const resetCountdown = countdown(resetEvent, now);
  const lastReset = lastTimedEvent(status, "reset", now);
  const lastBank = lastTimedEvent(status, "bank_credit", now);

  const changeTimezone = (value: string) => {
    setTimezoneChoice(value);
    window.localStorage.setItem(STORAGE_KEY, value);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="#top">
          <span className={styles.brandMark}><i /><i /><i /></span>
          RESET SIGNAL
        </a>
        <nav className={styles.nav}>
          <a href="#recent">Recent signals</a>
          <a
            href="https://github.com/AllenXiao95/codex-reset-signal"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowIcon />
          </a>
        </nav>
      </header>

      <section className={styles.hero} id="top">
        <div>
          <div className={styles.kicker}>{resetCountdown ? "NEXT RESET" : "LATEST RESET"}</div>
          <div className={styles.statusLine}>
            <span className={`${styles.dot} ${monitorHealth.className}`} />
            {monitorHealth.label}
          </div>
          <h1>{resetCountdown ?? displayEventTime(resetEvent, timezone)}</h1>
          <div className={styles.heroMeta}>
            <strong>{resetEvent?.status ?? "No reset detected"}</strong>
            {resetCountdown ? <span>{displayEventTime(resetEvent, timezone)}</span> : null}
          </div>
          {resetSignal ? (
            <p className={styles.evidence}>{resetEvent?.evidence ?? resetSignal.text}</p>
          ) : (
            <p className={styles.evidence}>
              The monitor is ready. The latest recent page is parsed during bootstrap without sending historical alerts.
            </p>
          )}
          <div className={styles.actions}>
            {resetSignal ? (
              <a className={styles.primary} href={resetSignal.url} target="_blank" rel="noreferrer">
                View original post <ArrowIcon />
              </a>
            ) : null}
            <label className={styles.timezoneControl}>
              <span>Timezone</span>
              <select value={timezoneChoice} onChange={(event) => changeTimezone(event.target.value)}>
                <option value="auto">Auto · {autoTimezone}</option>
                {timezoneOptions.map((zone) => (
                  <option value={zone} key={zone}>{zone}</option>
                ))}
              </select>
            </label>
          </div>
          {resetEvent?.time.note ? <p className={styles.note}>{resetEvent.time.note}</p> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>

        <aside className={styles.sidePanel}>
          <article>
            <span>LAST RESET</span>
            <strong>{displayEventTime(lastReset?.event ?? null, timezone)}</strong>
            <small>{lastReset?.event.status ?? "No past timed reset"}</small>
          </article>
          <article>
            <span>LAST BANK</span>
            <strong>{displayEventTime(lastBank?.event ?? null, timezone)}</strong>
            <small>{lastBank?.event.status ?? "No past timed bank reset"}</small>
          </article>
          <article>
            <span>BANK RESET</span>
            <strong>{displayEventTime(bankEvent, timezone)}</strong>
            <small>{bankEvent?.status ?? "Not announced"}</small>
          </article>
          <article>
            <span>BANK EXPIRY</span>
            <strong>{displayEventTime(expiryEvent, timezone)}</strong>
            <small>{expiryEvent?.status ?? "Not announced"}</small>
          </article>
          <article>
            <span>MONITOR</span>
            <strong>{monitorHealth.label}</strong>
            <small>
              Last checked {status?.monitor.lastCheckedAt ? formatMoment(status.monitor.lastCheckedAt, timezone) : "—"}
            </small>
          </article>
        </aside>
      </section>

      <section className={styles.facts}>
        <div><span>Target</span><strong>@{status?.username ?? "thsottiaux"}</strong></div>
        <div><span>Provider</span><strong>{status?.monitor.provider ?? "fxembed"}</strong></div>
        <div><span>Display timezone</span><strong>{timezone}</strong></div>
        <div><span>Last successful check</span><strong>{status?.monitor.lastSuccessAt ? formatMoment(status.monitor.lastSuccessAt, timezone) : "—"}</strong></div>
      </section>

      <section className={styles.recent} id="recent">
        <div className={styles.sectionHead}>
          <div>
            <span>RECENT SIGNALS</span>
            <h2>Detected, not delivery-gated.</h2>
          </div>
          <p>Signals appear here as soon as they are detected. Notification delivery is tracked separately.</p>
        </div>
        {status?.recent.length ? (
          <div className={styles.signalList}>
            {status.recent.map((signal) => (
              <a href={signal.url} target="_blank" rel="noreferrer" key={signal.version}>
                <time>{signal.postCreatedAt ? formatMoment(signal.postCreatedAt, "UTC") : "—"}</time>
                <div>
                  <strong>{signal.events.map((event) => `${event.type} · ${event.status}`).join(" / ")}</strong>
                  <p>{signal.text}</p>
                </div>
                <span>{signal.deliveryChannels.length ? signal.deliveryChannels.join(" + ") : "delivery pending / bootstrap"}</span>
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>No reset-related signal has been detected in the current runtime state yet.</div>
        )}
      </section>

      <footer className={styles.footer}>
        <span>Times are stored canonically in UTC and converted only for display.</span>
        <a href="https://github.com/AllenXiao95/codex-reset-signal/blob/main/LICENSE" target="_blank" rel="noreferrer">
          MIT License <ArrowIcon />
        </a>
      </footer>
    </main>
  );
}
