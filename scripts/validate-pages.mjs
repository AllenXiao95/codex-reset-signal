import { readFile } from "node:fs/promises";

const html = await readFile("pages/index.html", "utf8");

const required = [
  '<meta name="viewport"',
  'monitor-state/status.json',
  'Intl.DateTimeFormat().resolvedOptions().timeZone',
  'reset-signal-timezone',
  'raw.githubusercontent.com',
  'schemaVersion !== 1',
];

for (const marker of required) {
  if (!html.includes(marker)) {
    throw new Error(`Pages fallback is missing required marker: ${marker}`);
  }
}

if (/\b(?:src|href)=["']\/assets\//.test(html)) {
  throw new Error("Pages fallback must not depend on root-relative /assets paths.");
}

if (!html.includes('text.textContent = signal.text')) {
  throw new Error("Dynamic post text must be rendered with textContent, not HTML injection.");
}

console.log("GitHub Pages fallback validation passed.");
