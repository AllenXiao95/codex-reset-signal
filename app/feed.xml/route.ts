import { renderRssFeed } from "@/src/feed";
import type { PublicStatus } from "@/src/types";

const DEFAULT_STATUS_URL =
  "https://raw.githubusercontent.com/AllenXiao95/codex-reset-signal/monitor-state/status.json";

export async function GET() {
  const configured = process.env.RESET_STATUS_URL?.trim() || DEFAULT_STATUS_URL;
  const url = new URL(configured);
  url.searchParams.set("_", Date.now().toString());

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return new Response("Feed source unavailable\n", {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const status = (await response.json()) as Partial<PublicStatus>;
    if (
      status.schemaVersion !== 1 ||
      !status.monitor ||
      !status.latest ||
      !Array.isArray(status.recent) ||
      typeof status.username !== "string"
    ) {
      return new Response("Feed source returned an unsupported payload\n", {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(renderRssFeed(status as PublicStatus), {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return new Response("Feed source is unavailable\n", {
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
