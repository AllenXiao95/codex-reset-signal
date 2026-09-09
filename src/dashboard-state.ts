import type { ResetEvent } from "./events";

export type ResetHeroState = {
  kicker: "NEXT RESET" | "LATEST RESET";
  status: string;
  showPlannedTime: boolean;
  showCountdown: boolean;
};

export function resetHeroState(
  event: ResetEvent | null,
  now: number,
): ResetHeroState {
  if (!event) {
    return {
      kicker: "LATEST RESET",
      status: "No reset signal",
      showPlannedTime: false,
      showCountdown: false,
    };
  }

  const start = event.time.start ? new Date(event.time.start).getTime() : NaN;
  const hasFuturePlan =
    event.status === "scheduled" &&
    Number.isFinite(start) &&
    start > now &&
    ["exact", "window", "date"].includes(event.time.kind);

  if (hasFuturePlan) {
    return {
      kicker: "NEXT RESET",
      status: "Reset scheduled",
      showPlannedTime: true,
      showCountdown: ["exact", "window"].includes(event.time.kind),
    };
  }

  if (event.status === "completed") {
    return {
      kicker: "LATEST RESET",
      status: "Reset completed",
      showPlannedTime: false,
      showCountdown: false,
    };
  }

  if (event.status === "scheduled") {
    return {
      kicker: "LATEST RESET",
      status: "Reset expected · awaiting confirmation",
      showPlannedTime: false,
      showCountdown: false,
    };
  }

  if (event.status === "announced") {
    return {
      kicker: "LATEST RESET",
      status: "Reset announced · time not confirmed",
      showPlannedTime: false,
      showCountdown: false,
    };
  }

  return {
    kicker: "LATEST RESET",
    status: "Reset signal uncertain",
    showPlannedTime: false,
    showCountdown: false,
  };
}

export function isCompletedReset(event: ResetEvent): boolean {
  return event.type === "reset" && event.status === "completed";
}
