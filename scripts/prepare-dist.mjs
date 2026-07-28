import { cp, rm, stat } from "node:fs/promises";

await stat("out");
await rm("dist", { recursive: true, force: true });
await cp("out", "dist", { recursive: true });
console.log("Prepared static deployment in dist/.");
