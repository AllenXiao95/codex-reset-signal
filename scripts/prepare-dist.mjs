import { cp, mkdir, stat } from "node:fs/promises";

await stat("dist/server/index.js");
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Prepared vinext deployment metadata in dist/.");
