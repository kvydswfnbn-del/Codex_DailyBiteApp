import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { candidateToDeal, validateCandidate } from "./lib/deal-utils.mjs";

const root = resolve(import.meta.dirname, "..");
const candidatePath = resolve(root, "pipeline/input/candidates.json");
const dealsPath = resolve(root, "data/deals.json");
const metaPath = resolve(root, "data/meta.json");
const reportPath = resolve(root, "pipeline/reports/publish-report.json");
const validateOnly = process.argv.includes("--validate-only");

const candidates = JSON.parse(await readFile(candidatePath, "utf8"));
if (!Array.isArray(candidates)) throw new Error("pipeline/input/candidates.json must contain an array");

const now = new Date().toISOString();
const report = { generated_at: now, candidates: [], published: 0, rejected: 0 };
const approvedDeals = [];

for (const candidate of candidates) {
  const validationErrors = validateCandidate(candidate);
  const result = candidateToDeal(candidate, now);
  const errors = [...new Set([...validationErrors, ...result.errors])];
  const record = { candidate_id: candidate.candidate_id || null, status: candidate.status || null, errors };
  if (result.deal) {
    approvedDeals.push(result.deal);
    report.published += 1;
    record.output_id = result.deal.id;
  } else if (candidate.status === "approved") {
    report.rejected += 1;
  }
  report.candidates.push(record);
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (validateOnly) {
  if (report.rejected > 0) process.exitCode = 1;
  console.log(`Validated ${candidates.length} candidate(s); ${report.rejected} approved candidate(s) failed.`);
} else {
  const existingDeals = JSON.parse(await readFile(dealsPath, "utf8"));
  const preservedDeals = existingDeals.filter(deal => deal.event_end_date >= now.slice(0, 10));
  const byId = new Map([...preservedDeals, ...approvedDeals].map(deal => [deal.id, deal]));
  const deals = [...byId.values()].sort((a, b) => b.bite_score - a.bite_score || a.event_end_date.localeCompare(b.event_end_date));
  await writeFile(dealsPath, `${JSON.stringify(deals, null, 2)}\n`);
  await writeFile(metaPath, `${JSON.stringify({
    schema_version: 1,
    generated_at: now,
    pipeline_status: "reviewed-publish",
    approved_deal_count: deals.length
  }, null, 2)}\n`);
  console.log(`Published ${approvedDeals.length} approved candidate(s); ${deals.length} active deal(s) remain.`);
}
