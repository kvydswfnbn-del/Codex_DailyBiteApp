const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL_PATTERN = /^https:\/\/.+/i;

export function isIsoDate(value) {
  return typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function isHttpsUrl(value) {
  return typeof value === "string" && HTTP_URL_PATTERN.test(value);
}

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function stableId(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

export function scoreDeal(pricing = {}) {
  const itemValue = Number(pricing.item_value_cents || 0);
  const userPrice = Number(pricing.user_price_cents || 0);
  const savingsRatio = itemValue > 0 ? clamp((itemValue - userPrice) / itemValue, 0, 1) : 0;
  const freeOrLowCost = userPrice === 0 ? 40 : Math.round(savingsRatio * 30);
  const value = clamp(Math.round(itemValue / 100 * 2.5), 0, 25);
  const redemptionSteps = Number(pricing.redemption_steps || 0);
  const simplicity = clamp(20 - redemptionSteps * 4 - (pricing.purchase_required ? 8 : 0) - (pricing.signup_required ? 4 : 0), 0, 20);
  const scarcity = clamp((pricing.time_sensitive ? 8 : 0) + (pricing.availability === "nationwide" ? 7 : 3), 0, 15);
  const scoreBreakdown = { free_or_low_cost: freeOrLowCost, value, simplicity, scarcity };
  return {
    score_breakdown: scoreBreakdown,
    bite_score: Object.values(scoreBreakdown).reduce((total, value) => total + value, 0)
  };
}

export function verificationResult(candidate) {
  const sources = candidate.verification_sources || [];
  const official = sources.some(source => source.type === "official" && isHttpsUrl(source.url));
  const credible = sources.filter(source => source.type === "credible" && isHttpsUrl(source.url)).length;
  return {
    verified: official || credible >= 2,
    verification_type: official ? "Official" : credible >= 2 ? "Two credible sources" : null
  };
}

export function validateCandidate(candidate) {
  const errors = [];
  const required = ["candidate_id", "title", "restaurant", "description", "location", "source_url", "event_type", "event_start_date", "event_end_date"];
  for (const field of required) {
    if (!candidate[field]) errors.push(`Missing ${field}`);
  }
  if (candidate.source_url && !isHttpsUrl(candidate.source_url)) errors.push("source_url must be an HTTPS URL");
  if (candidate.event_start_date && !isIsoDate(candidate.event_start_date)) errors.push("event_start_date must use YYYY-MM-DD");
  if (candidate.event_end_date && !isIsoDate(candidate.event_end_date)) errors.push("event_end_date must use YYYY-MM-DD");
  if (candidate.event_start_date && candidate.event_end_date && candidate.event_start_date > candidate.event_end_date) {
    errors.push("event_end_date cannot be before event_start_date");
  }
  if (!Array.isArray(candidate.verification_sources) || candidate.verification_sources.length === 0) {
    errors.push("At least one verification source is required");
  }
  return errors;
}

export function candidateToDeal(candidate, now = new Date().toISOString()) {
  const errors = validateCandidate(candidate);
  const verification = verificationResult(candidate);
  if (errors.length || !verification.verified || candidate.status !== "approved") {
    return { deal: null, errors: errors.length ? errors : ["Candidate is not approved and verified"] };
  }
  const scoring = scoreDeal(candidate.pricing);
  const idSeed = `${candidate.event_start_date}-${candidate.restaurant}-${candidate.title}`;
  return {
    errors: [],
    deal: {
      id: `db_${candidate.event_start_date.replaceAll("-", "")}_${stableId(idSeed)}`,
      title: candidate.title,
      restaurant: candidate.restaurant,
      description: candidate.description,
      location: candidate.location,
      source_url: candidate.source_url,
      discovery_source: candidate.discovery_source,
      verification_sources: candidate.verification_sources,
      ...scoring,
      ...verification,
      event_type: candidate.event_type,
      category: candidate.category || candidate.event_type.replaceAll("_", " "),
      event_start_date: candidate.event_start_date,
      event_end_date: candidate.event_end_date,
      created_at: candidate.created_at || now,
      updated_at: now,
      reason: candidate.reason || "Verified and scored by the DailyBite pipeline"
    }
  };
}
