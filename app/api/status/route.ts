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
      return Response.json(
        { error: `Status source returned HTTP ${response.status}` },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    const status = (await response.json()) as Partial<PublicStatus>;
    if (status.schemaVersion !== 1 || !status.monitor || !status.latest) {
      return Response.json(
        { error: "Status source returned an unsupported payload" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(status, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return Response.json(
      { error: "Status source is unavailable" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
