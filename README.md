# jobs-research-agent

Agentic lead-gen pipeline built on the Claude Agent SDK (same stack as `tiktok-research-agent`).

**What it does**
1. Queries SerpAPI (`engine=google_jobs`) for US companies hiring **Executive Assistant** / **Office Manager**
2. Enriches each company via Apollo.io and keeps only those with `employee_count <= MAX_COMPANY_SIZE` (default 20)
3. Finds a founder/owner/CEO contact with a valid email via Apollo
4. Sends a personalized cold email via the Gmail API
5. Saves every lead to `data/leads.json` and `data/leads.csv` for dedup across runs

## Setup

```bash
npm install
cp .env.example .env
# fill SERPAPI_API_KEY, APOLLO_API_KEY, ANTHROPIC_API_KEY
```

### Gmail OAuth (one time)

1. Google Cloud console → create project → enable **Gmail API**
2. APIs & Services → Credentials → Create OAuth client ID → **Desktop app**
3. Copy the client ID + secret into `.env` as `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`
4. Run `npm run gmail:token`, open the URL, approve, paste the code back
5. Copy the printed `GMAIL_REFRESH_TOKEN` into `.env`
6. Set `GMAIL_SENDER` to the email that authorized the app

Scope requested: `https://www.googleapis.com/auth/gmail.send` (send only, no read access).

## Run

```bash
# Dry run (no emails sent, full pipeline logged)
DRY_RUN=true MAX_LEADS_PER_RUN=3 npm start

# Live warmup (5/day — raise gradually as deliverability builds)
MAX_LEADS_PER_RUN=5 npm start
```

Re-running is idempotent — `get_existing_leads` dedupes against `data/leads.json`.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API |
| `SERPAPI_API_KEY` | — | Google Jobs search |
| `APOLLO_API_KEY` | — | Company + people enrichment |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` / `GMAIL_SENDER` | — | Gmail API OAuth2 |
| `GMAIL_SENDER_NAME` | — | Display name in From header |
| `SENDER_FIRST_NAME` | `Damien A.` | Signature |
| `SENDER_TITLE` | `Admin & Ops Consultant` | Signature |
| `CLAUDE_MODEL` | `claude-sonnet-4-5` | Model ID |
| `MAX_COMPANY_SIZE` | `20` | Hard employee cap |
| `MAX_LEADS_PER_RUN` | `5` | Sends per run (warmup) |
| `DRY_RUN` | `false` | If true, log email but don't send |

## Notes & risks

- **Apollo email reveals cost credits.** On a free plan most people come back `email_status: "locked"` — the agent will skip them. Confirm your plan before running at scale.
- **CAN-SPAM compliance.** Cold email to US recipients legally requires a physical mailing address and an opt-out mechanism. Add these to `renderEmailBody` in `src/prompt.ts` before live sends if you intend to scale.
- **Deliverability.** Start at 5/day and ramp slowly. Personal Gmail reputations degrade fast under cold outreach — consider a dedicated domain + warmup tool before going beyond a handful per day.
- **Gmail daily cap.** 500 messages/day for consumer Gmail, 2000/day for Workspace.

## Deploy

```bash
railway up
```

Schedule once per day via Railway cron or an external cron (GitHub Actions `workflow_dispatch` + schedule).
