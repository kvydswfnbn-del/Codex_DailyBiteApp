# DailyBite

DailyBite is a static, mobile-first food-deal intelligence app. It publishes only
offers that are both verified and worth a user's attention. The site remains
deployable on GitHub Pages; no database or backend is required.

## Public data

The deployed app reads these files from `data/`:

- `deals.json` — approved, verified, currently relevant deals only
- `food_days.json` — food-holiday planning data
- `meta.json` — data-generation timestamp and pipeline state

`data/` is the single source of truth for the app and the publishing pipeline.

## Review-first pipeline

```text
enabled source URL → scan report → candidate → verification → deterministic score
→ approved public deal → GitHub pull request → GitHub Pages
```

The pipeline deliberately does **not** infer that an online claim is true. A
candidate is published only when it is marked `approved` and has either one
official HTTPS verification source or two credible HTTPS sources. This keeps
automation from turning a social-media claim into a public recommendation.

### Add a candidate

Add a fully researched record to `pipeline/input/candidates.json`. An approved
candidate needs these fields:

```json
{
  "candidate_id": "candidate_20260724_001",
  "status": "approved",
  "title": "Free Burger",
  "restaurant": "Example Restaurant",
  "description": "A free burger with no purchase required.",
  "location": "Nationwide",
  "source_url": "https://restaurant.example/deal",
  "discovery_source": {
    "type": "official_website",
    "name": "Example Restaurant",
    "url": "https://restaurant.example/deal"
  },
  "verification_sources": [
    { "type": "official", "url": "https://restaurant.example/deal" }
  ],
  "event_type": "promotion",
  "event_start_date": "2026-07-24",
  "event_end_date": "2026-07-24",
  "pricing": {
    "item_value_cents": 1000,
    "user_price_cents": 0,
    "purchase_required": false,
    "signup_required": false,
    "redemption_steps": 0,
    "availability": "nationwide",
    "time_sensitive": true
  }
}
```

The score is calculated rather than invented: free/low cost (40), value (25),
simplicity (20), and scarcity (15). The public app displays that breakdown.

### Run locally

Use Node 20 or newer. No package installation is needed.

```bash
npm test
npm run scan
npm run validate
npm run publish-data
```

`scan` fetches only enabled HTTPS entries in `pipeline/input/sources.json` and
writes an inspectable report. It never publishes a deal. `publish-data` writes
only approved, verified candidates to `data/deals.json` and removes expired
public deals. Inspect the generated report in `pipeline/reports/` before
committing a public-data change.

## Scheduled automation

`.github/workflows/daily-scan.yml` runs every day at 11:17 UTC and can also be
started manually from the Actions tab. It runs tests, scans enabled sources,
validates candidates, and generates public data. If public data changed, it
opens a pull request. Merge that pull request only after checking sources,
redemption terms, dates, locations, and the BiteScore breakdown.

Before enabling the workflow, ensure GitHub Actions has permission to create
branches and pull requests in the repository's Actions settings. The workflow
uses only GitHub's official actions and the repository token.

## Deployment

Publish the repository root with GitHub Pages. The `.nojekyll` file ensures the
static `data/` directory is served unchanged.
