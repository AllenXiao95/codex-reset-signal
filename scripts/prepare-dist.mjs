import { cp, mkdir, rename, stat, writeFile } from "node:fs/promises";

await stat("dist/server/index.js");
await rename("dist/server/index.js", "dist/server/handler.js");
await writeFile(
  "dist/server/index.js",
  [
    'import handleRequest from "./handler.js";',
    "",
    "export default {",
    "  fetch(request) {",
    "    return handleRequest(request);",
    "  },",
    "};",
    "",
  ].join("\n"),
  "utf8",
);
await mkdir("dist/.openai", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Prepared vinext Cloudflare Worker entrypoint and metadata in dist/.");
