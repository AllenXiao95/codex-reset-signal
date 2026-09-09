import * as chrono from "chrono-node";
import { DateTime, FixedOffsetZone } from "luxon";
import type { XPost } from "./types";

export type EventTime = {
  kind: "exact" | "window" | "date" | "unknown" | "observed";
  start: string | null;
  end: string | null;
  evidence: string;
  note?: string;
};
export type ResetEvent = {
  type: "reset" | "bank_credit" | "bank_expiry" | "mention";
  status: "scheduled" | "completed" | "announced" | "uncertain";
  evidence: string;
  time: EventTime;
};
const unknown = (evidence: string, note: string): EventTime => ({
  kind: "unknown",
  start: null,
  end: null,
  evidence,
  note,
});
const numbers: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  half: 0.5,
};
const quantity = (s: string) => numbers[s.toLowerCase()] ?? Number(s);

/** Parse only event-local text. All relative expressions are anchored to publication. */
export function parseEventTime(
  text: string,
  createdAt: string | null,
  sourceTimezone?: string,
): EventTime {
  const ref = createdAt ? DateTime.fromISO(createdAt, { setZone: true }) : null;
  if (!ref?.isValid || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(createdAt!))
    return unknown(text, "缺少有效的发帖时间");
  if (
    /\bor\b/i.test(text) ||
    [
      ...text.matchAll(
        /\b(?:in|within|over)\s+(?:the\s+next\s+)?(?:\d+(?:\.\d+)?|an?|one|two|three|four|five|six|half)\s+(?:minutes?|hours?|days?)\b/gi,
      ),
    ].length > 1
  )
    return unknown(text, "包含多个候选时间或备选时间，需要核对原文");
  const relative =
    text.match(
      /\b(within(?:\s+the\s+next)?|in(?:\s+the\s+next)?|over\s+the\s+next)\s+(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|half)\s+(minutes?|hours?|days?)\b/i,
    ) ?? text.match(/\b(within|in)\s+the\s+next\s+()(hour|minute|day)\b/i);
  if (relative) {
    const n = relative[2] ? quantity(relative[2]) : 1;
    const end = ref
      .plus({ [relative[3].toLowerCase().replace(/s$/, "") + "s"]: n })
      .toUTC()
      .toISO();
    if (!end) return unknown(relative[0], "相对时间超出可表示范围");
    const window =
      /within|next|over/i.test(relative[1]) || /the next/i.test(relative[0]);
    return {
      kind: window ? "window" : "exact",
      start: window ? ref.toUTC().toISO() : end,
      end: window ? end : null,
      evidence: relative[0],
    };
  }
  const pacific = /\b(?:PT|Pacific(?:\s+Time)?)\b/i.test(text);
  const sourceZone = pacific ? "America/Los_Angeles" : sourceTimezone;
  const base = sourceZone ? ref.setZone(sourceZone) : ref.toUTC();
  // chrono supplies candidate calendar fields; Luxon applies IANA rules on the event date.
  const parsed = chrono.en.casual.parse(
    text.replace(/\bPacific(?:\s+Time)?\b/gi, "PT"),
    { instant: ref.toJSDate(), timezone: base.offset },
    { forwardDate: /\b(?:will|expires|scheduled|tomorrow|next)\b/i.test(text) },
  );
  if (!parsed.length) return unknown(text, "原文没有可确定的时间");
  if (parsed.length > 1)
    return unknown(text, "同一事件包含多个时间，需要核对原文");
  const result = parsed[0];
  const c = result.start;
  const explicitOffset = c.isCertain("timezoneOffset");
  if (!pacific && !explicitOffset && !sourceZone)
    return unknown(
      result.text,
      "原文未说明时区；可配置 SOURCE_TIMEZONE 并在通知中标记假设",
    );
  if (/\b(?:CST|IST|BST)\b/i.test(result.text))
    return unknown(result.text, "时区缩写有歧义，请核对原文");
  const zone = pacific
    ? "America/Los_Angeles"
    : explicitOffset
      ? FixedOffsetZone.instance(c.get("timezoneOffset")!)
      : sourceZone!;
  const convert = (component: chrono.ParsedComponents) => {
    const parts = {
      year: component.get("year")!,
      month: component.get("month")!,
      day: component.get("day")!,
      hour: component.isCertain("hour") ? component.get("hour")! : 0,
      minute: component.get("minute") ?? 0,
      second: component.get("second") ?? 0,
    };
    const date = DateTime.fromObject(parts, { zone });
    if (
      !date.isValid ||
      date.hour !== parts.hour ||
      date.minute !== parts.minute ||
      date.getPossibleOffsets().length > 1
    )
      return null;
    return date;
  };
  const start = convert(c);
  const end = result.end ? convert(result.end) : null;
  if (!start || (result.end && !end))
    return unknown(result.text, "时间无效或处于夏令时跳变／重复区间");
  const assumed =
    !explicitOffset && !pacific
      ? `按配置假设原文时区为 ${sourceZone}`
      : undefined;
  if (!c.isCertain("hour"))
    return {
      kind: "date",
      start: start.toUTC().toISO(),
      end: start.plus({ days: 1 }).toUTC().toISO(),
      evidence: result.text,
      note: assumed,
    };
  if (end && end < start) return unknown(result.text, "时间范围顺序无效");
  return {
    kind: end ? "window" : "exact",
    start: start.toUTC().toISO(),
    end: end?.toUTC().toISO() ?? null,
    evidence: result.text,
    note: assumed,
  };
}

export function extractEvents(
  post: XPost,
  sourceTimezone?: string,
): ResetEvent[] {
  if (!/\breset(?:s|ting)?\b/i.test(post.text)) return [];
  const clauses = post.text
    .split(/(?:[;\n]|\.(?=\s+[A-Z]|$)|\s+and\s+(?=we\b|your\b|you\b|one\b))/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const events: ResetEvent[] = [];
  for (const clause of clauses) {
    const bank = /\bbank(?:ed)?\b/i.test(clause);
    if (
      !/\breset(?:s|ting)?\b/i.test(clause) &&
      !(bank && /\breset/i.test(post.text))
    )
      continue;
    if (/\b(?:password|factory|router|database)\b/i.test(clause)) continue;
    if (
      /\?|\b(?:wish|hope|maybe|might|could|would|should|unless|if|may|please|not|never|won't|isn't|aren't|can't|cannot|don't|didn't)\b/i.test(
        clause,
      )
    ) {
      events.push({
        type: "mention",
        status: "uncertain",
        evidence: clause,
        time: unknown(clause, "讨论、请求或否定，不代表已确认的重置"),
      });
      continue;
    }
    const expiry =
      bank && /\b(?:expire[sd]?|expiry|expiration)\b/i.test(clause);
    const completed =
      /\b(?:have|has|just|already)\s+(?:been\s+)?reset\b|\breset\s+(?:is\s+)?(?:complete|done)|\blimits?\s+(?:are|is|were|was)\s+(?:now\s+)?(?:fully\s+)?reset\b/i.test(
        clause,
      );
    let type: ResetEvent["type"] = expiry
      ? "bank_expiry"
      : bank
        ? "bank_credit"
        : "reset";
    let timingText = clause;
    // A credit's validity is not its grant time. Keep that duration as a separate unknown expiry.
    const validity =
      bank && !expiry
        ? clause.match(
            /\b(?:(?:valid|available|usable|use it|usage)\s+)?(?:for|over)\s+(?:the\s+next\s+)?(\d+|one|two)\s+(hours?|days?)\b/i,
          )
        : null;
    if (validity) timingText = clause.slice(0, validity.index);
    let time = parseEventTime(timingText, post.createdAt, sourceTimezone);
    if (
      time.kind === "unknown" &&
      (completed || /\bnow\b/i.test(clause)) &&
      !/\b(?:at|tomorrow|yesterday|ago|next)\b/i.test(clause) &&
      post.createdAt &&
      DateTime.fromISO(post.createdAt).isValid
    ) {
      time = {
        kind: "observed",
        start: DateTime.fromISO(post.createdAt).toUTC().toISO(),
        end: null,
        evidence: clause,
        note: "使用公告发布时间；不代表账户实际到账时刻",
      };
    }
    const actionable =
      completed ||
      /\b(?:will|resetting|now|credit|credited|adding|added|grant|granted|expire|expires)\b/i.test(
        clause,
      ) ||
      time.kind !== "unknown";
    if (!actionable) type = "mention";
    events.push({
      type,
      status:
        type === "mention"
          ? "uncertain"
          : completed
            ? "completed"
            : ["exact", "window", "date"].includes(time.kind)
              ? "scheduled"
              : "announced",
      evidence: clause,
      time,
    });
    if (validity)
      events.push({
        type: "bank_expiry",
        status: "announced",
        evidence: validity[0],
        time: unknown(
          validity[0],
          "有效期已说明，但起算点未明确；不推算精确到期时刻",
        ),
      });
  }
  return events;
}

export function formatTime(time: EventTime, timezone: string): string {
  if (!time.start) return `时间未确定（${time.note ?? time.evidence}）`;
  const format = (s: string) =>
    DateTime.fromISO(s).setZone(timezone).toFormat("yyyy-MM-dd HH:mm ZZ");
  const label = {
    exact: "原文事件时刻",
    window: "原文事件时间窗口",
    date: "日期范围（未指定具体时刻）",
    observed: "公告发布时刻",
    unknown: "时间未确定",
  }[time.kind];
  return `${label}：${format(time.start)}${time.end ? ` ～ ${format(time.end)}` : ""} [${timezone}]${time.note ? `（${time.note}）` : ""}`;
}
