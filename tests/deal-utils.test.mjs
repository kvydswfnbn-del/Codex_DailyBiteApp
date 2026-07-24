import test from "node:test";
import assert from "node:assert/strict";
import { candidateToDeal, scoreDeal, verificationResult } from "../pipeline/lib/deal-utils.mjs";

test("a free nationwide deal earns the maximum deterministic score", () => {
  const result = scoreDeal({ item_value_cents: 1000, user_price_cents: 0, availability: "nationwide", time_sensitive: true });
  assert.equal(result.bite_score, 100);
});

test("verification requires an official source or two credible sources", () => {
  assert.equal(verificationResult({ verification_sources: [{ type: "credible", url: "https://one.example" }] }).verified, false);
  assert.equal(verificationResult({ verification_sources: [{ type: "official", url: "https://official.example" }] }).verified, true);
});

test("only approved, verified, complete candidates become public deals", () => {
  const result = candidateToDeal({
    candidate_id: "candidate_1", status: "approved", title: "Free meal", restaurant: "Test Restaurant",
    description: "A genuinely free meal.", location: "Nationwide", source_url: "https://official.example/deal",
    event_type: "promotion", event_start_date: "2026-07-24", event_end_date: "2026-07-24",
    discovery_source: { type: "manual", name: "Test", url: "https://source.example" },
    verification_sources: [{ type: "official", url: "https://official.example/deal" }],
    pricing: { item_value_cents: 1000, user_price_cents: 0, availability: "nationwide", time_sensitive: true }
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.deal.verified, true);
  assert.equal(result.deal.bite_score, 100);
});
