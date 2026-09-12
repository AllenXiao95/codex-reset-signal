import type { PublicSignal, PublicStatus } from "./types";

const ALLOWED_TYPES = ["reset", "bank_credit"] as const;
type FeedEventType = (typeof ALLOWED_TYPES)[number];

const eventLabels: Record<FeedEventType, string> = {
  reset: "Reset",
  bank_credit: "Bank credit",
};

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rssDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toUTCString() : null;
}

function describeSignal(
  signal: PublicSignal,
  type: FeedEventType,
): string | null {
  const event = signal.events.find((candidate) => candidate.type === type);
  if (!event) return null;

  const timing = event.time.start
    ? event.time.end
      ? `Time: ${event.time.start} → ${event.time.end}`
      : `Time: ${event.time.start}`
    : event.time.evidence
      ? `Timing: ${event.time.evidence}`
      : null;

  return [
    `${eventLabels[type]} · ${event.status}`,
    timing,
    event.time.note ? `Note: ${event.time.note}` : null,
    event.evidence ? `Evidence: ${event.evidence}` : null,
    "",
    signal.text,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function renderRssFeed(status: PublicStatus): string {
  const items: string[] = [];
  const seen = new Set<string>();

  for (const signal of status.recent) {
    for (const type of ALLOWED_TYPES) {
      const description = describeSignal(signal, type);
      if (!description) continue;

      const guid = `${signal.id}:${type}`;
      if (seen.has(guid)) continue;
      seen.add(guid);

      const event = signal.events.find((candidate) => candidate.type === type)!;
      const published = rssDate(signal.postCreatedAt);
      items.push(
        [
          "    <item>",
          `      <guid isPermaLink="false">${xml(guid)}</guid>`,
          `      <title>${xml(`${eventLabels[type]} · ${event.status} · @${status.username}`)}</title>`,
          `      <link>${xml(signal.url)}</link>`,
          published ? `      <pubDate>${published}</pubDate>` : null,
          `      <category>${type}</category>`,
          `      <description>${xml(description)}</description>`,
          "    </item>",
        ]
          .filter((line): line is string => line !== null)
          .join("\n"),
      );
    }
  }

  const built = rssDate(status.updatedAt);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${xml(`Codex Reset Signal · @${status.username}`)}</title>`,
    `    <link>${xml(`https://x.com/${status.username}`)}</link>`,
    "    <description>Actionable reset and bank-credit signals detected by codex-reset-signal.</description>",
    built ? `    <lastBuildDate>${built}</lastBuildDate>` : null,
    "    <generator>codex-reset-signal</generator>",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
