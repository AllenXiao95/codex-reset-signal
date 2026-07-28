import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MonitorState } from "./types";

export function emptyState(username: string, keyword: string): MonitorState {
  return {
    username,
    keyword,
    userId: null,
    sinceId: null,
    lastCheckedAt: null,
    lastRunStatus: "waiting-for-first-run",
    postsScanned: 0,
    matches: [],
  };
}

export async function readState(
  path: string,
  username: string,
  keyword: string,
): Promise<MonitorState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as MonitorState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyState(username, keyword);
    }
    throw error;
  }
}

export async function writeState(path: string, state: MonitorState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
