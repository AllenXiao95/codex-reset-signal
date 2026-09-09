import historySeed from "../history/seed.json";
import type { ResetEvent } from "./events";
import type { PublicSignal } from "./types";

type SeedRecord = {
  id: string;
  text: string;
  url: string;
  postCreatedAt: string;
  collectedAt: string;
  events: ResetEvent[];
};

export function historicalSignals(): PublicSignal[] {
  return (historySeed as SeedRecord[]).map((item) => ({
    version: `history:${item.id}`,
    id: item.id,
    text: item.text,
    url: item.url,
    postCreatedAt: item.postCreatedAt,
    detectedAt: item.collectedAt,
    events: item.events,
    deliveryChannels: [],
    origin: "historical_seed",
  }));
}
