import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isHttpsUrl } from "./lib/deal-utils.mjs";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "pipeline/input/sources.json");
const outputDirectory = resolve(root, "pipeline/reports/scans");
const sources = JSON.parse(await readFile(sourcePath, "utf8"));
if (!Array.isArray(sources)) throw new Error("pipeline/input/sources.json must contain an array");
await mkdir(outputDirectory, { recursive: true });

const scannedAt = new Date().toISOString();
const result = { scanned_at: scannedAt, sources: [] };
for (const source of sources.filter(item => item.enabled)) {
  const record = { source_id: source.source_id, url: source.url, status: "failed" };
  if (!isHttpsUrl(source.url)) {
    record.error = "Only HTTPS source URLs are allowed";
  } else {
    try {
      const response = await fetch(source.url, { headers: { "user-agent": "DailyBite-review-pipeline/0.1" }, signal: AbortSignal.timeout(15000) });
      const body = await response.text();
      record.status = response.ok ? "fetched" : "http_error";
      record.http_status = response.status;
      record.content_preview = body.replace(/\s+/g, " ").slice(0, 1000);
    } catch (error) {
      record.error = error.message;
    }
  }
  result.sources.push(record);
}
const filename = `scan-${scannedAt.replaceAll(":", "-")}.json`;
await writeFile(resolve(outputDirectory, filename), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Scanned ${result.sources.length} enabled source(s). No deals were published.`);
