# OpenGong Lite

**Gong’s job, free.** Upload a sales call → get deal notes with receipts.

Every claim points to the exact line in the transcript. Unproven claims stay visible — they never pretend to be facts. Prompt-injection lines are quarantined and barred from the follow-up email.

![OpenGong Lite — deal notes with receipts](./public/screenshot.png)

> **You'll hate this if:** you want fully local/private processing. Audio goes to PyAI (transcription) and optionally Anthropic or an OpenAI-compatible LLM (extraction). If that's a blocker, self-host those APIs or stop here.

## Pipeline (real PyAI)

```
audio (upload or https URL)
  → Hear async job  POST /v1/transcription/jobs  (diarize / channel)
  → poll            GET  /v1/transcription/jobs/{id}
  → Recap           POST/GET /v1/recap/calls/{call_id}  (pack: sales_outbound)
  → gates           schema + evidence receipts
  → UI / share / export
```

If Recap isn’t enabled on the key/org, the harness falls back to an optional
OpenAI-compatible LLM (`LLM_*`) or a deterministic local extractor so demos
still ship.

## Five-minute setup

```bash
git clone https://github.com/sarithakonudula/open-gong-lite.git
cd open-gong-lite   # ← don't skip this
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — samples work immediately, no key needed.

- **Samples** work with zero config. Click any sample → cited notes in seconds.
- **Live ingest** (upload a real call) auto-mints a free `pyai_test_` sandbox key on first use — no signup, no card. Key is stored in gitignored `data/.pyai-sandbox-key.json` and reused on subsequent runs.
- **Optional:** copy `.env.example` to `.env` to set a real `PYAI_API_KEY` or enable the login gate.

### Env (all optional)

```bash
# Live key — leave blank to auto-mint a free sandbox key on first upload
PYAI_API_KEY=pyai_test_...

# API endpoints (defaults built in, only set if self-hosting)
PYAI_BASE_URL=https://api.pyai.com/v1

# Recap add-on (deal intelligence). Falls back to local extractor if unavailable.
PYAI_RECAP_PACK_ID=sales_outbound

# Optional LLM fallback when Recap isn't on your org (OpenAI-compatible)
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
```

Scopes for the full live path:

- `hear:transcribe` + `transcribe:jobs` (Hear batch)
- `recap:read` (+ `recap:configure` once to enable)

## Score calls with a free LLM

Everything in the demo works with zero keys: Brightsmile 1 ships its scorecard
and deal-signal feed offline. Live scoring of your own calls needs any
OpenAI-compatible endpoint. Two free routes:

**Ollama (fully local, no signup):**

```bash
ollama pull llama3.1        # once
# .env
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.1
```

**Groq (hosted free tier):**

```bash
# .env — key from console.groq.com
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

Restart the dev server after setting these — config is read at boot. The
Scorecard tab's "Score with LLM" button goes live once both vars are present.

Running a shared deployment on your own key is fine: the key stays server-side
and never reaches the browser. Do two things first — set
`OPENGONG_AUTH_PASSWORD` so only people you let in can spend your tokens, and
put a hard spend cap on the key in your provider's console.

## Action layer

Gong records what happened. This layer does what was promised — and it keeps
the receipts discipline: nothing reaches the CRM, an email, a manager, or a
coaching drill unless it passed the evidence gate.

| Piece | What it does | Where |
|-------|--------------|-------|
| **Admin settings** | LLM endpoint/key/model, prompt guidance, HubSpot token, Slack webhook, risk threshold — editable at runtime, no restart. Secrets masked; stored server-side in `data/settings.json` (admin values win over env vars). | `/admin` |
| **HubSpot write-back** | One click on a run: auto-creates `ai_momentum_score` / `ai_momentum_direction` / `ai_next_action` / `ai_last_followup` / `ai_risk_level` deal properties, writes them, and logs the full cited notes as a deal note. Risk alerts become HubSpot tasks. | run page → *Sync to HubSpot*, `POST /api/hubspot/sync` |
| **Momentum score** | Deterministic 0–100 + direction (advancing / steady / stalling / at-risk) from gated claims only — every reason carries a transcript receipt. | digest, CRM properties |
| **Contextual follow-up email** | LLM drafts from *verified claims + CRM context only* (it never sees the transcript). Output is post-gated: cites an unproven claim → whole draft rejected; leak screen catches injected lines; falls back to the deterministic draft. | run page → *Draft contextual email*, `POST /api/email/contextual` |
| **Deal-risk warnings** | `POST /api/signals/scan` (hit it from any cron) scans open HubSpot deals — or stored runs, keyless — through the signal rule engine. Alerts ≥ your threshold go to **Slack**; pushable alerts become **HubSpot tasks**. The rep gets warned where they live, not on a page they forgot. | `/api/signals/scan` |
| **Management digest** | Per-deal rollup for a sales leader: momentum, verified highlights with receipts, open objections, risks, next steps. One click to Slack, or copy as markdown. | `/digest` |
| **Rep training loop** | Methodology scorecards now persist per run. Per-rep trait trends across calls, with drills that pair the pack's coaching content with the rep's *own gate-passed quotes* — "what you said" vs "what mastery sounds like". Personalized with receipts, never generic. | `/coach` |
| **Multi-call-type scoring** | A shared recording isn't always a sales call. A deterministic classifier (with cited marker lines) detects **sales / support / customer success** and routes to the right scorecard: 14 sales packs, **Support Excellence (QA)** (issue verification, ownership, troubleshooting rigor, expectation setting, FCR, escalation hygiene, prevention), or **Customer Success (Health & Renewal)** (outcome alignment, adoption with data, value realization, sponsor health, risk sensing, renewal timeline, expansion, success planning). Sales-only metrics stay in their lane: support/CS calls never write `ai_momentum_*` to a deal and show a kind badge in the digest instead. The coaching loop picks all three up automatically. | run page Scorecard tab (auto-detected), `/digest`, `/coach` |

HubSpot setup: create a [private app](https://developers.hubspot.com/docs/api/private-apps)
with `crm.objects.contacts/companies/deals/notes/tasks` read+write and
`crm.schemas.deals.write`, paste the token on `/admin` (or set
`HUBSPOT_ACCESS_TOKEN`). Slack: paste an incoming-webhook URL. Everything
degrades gracefully — no HubSpot means drafts stay local, no Slack means
alerts stay on `/signals`, no LLM means deterministic drafts.

Security posture of the layer:

- **Deal writes need a confirmed target.** Name matching only *proposes*
  candidates; a write happens when there's exactly one open deal, an explicit
  pick from the run-page picker, or a previously confirmed link stored on the
  run. Wrong-deal write-back by fuzzy match can't happen.
- **`/admin` is hard-locked in production** unless `OPENGONG_AUTH_PASSWORD`
  is set — an open deployment can't have its LLM endpoint repointed.
  Changing the LLM base URL also clears the saved key, so a stored key can
  never be replayed against a new host.
- **Settings secrets are encrypted at rest** (AES-256-GCM keyed off
  `OPENGONG_SESSION_SECRET`) in `data/settings.json`.
- **API responses are projections** — share tokens and transcripts never
  leave the server through `/api/digest`. Set `OPENGONG_SHARE_TTL_DAYS` to
  expire `/share` links.

Demo the risk loop without waiting a real day:

```bash
curl -X POST localhost:3000/api/signals/scan \
  -H 'Content-Type: application/json' -d '{"simulateIdleDays": 14}'
```

Cron for risk warnings (Railway cron, GitHub Action, or crontab):

```bash
curl -X POST https://your-app.example/api/signals/scan
```

## What you get

- Diarized transcript with speaker labels
- Summary, objections, intent, next steps, pain / pricing / competitors
- **Receipts**: click a claim → jump to the transcript line (and play that second when audio was uploaded)
- Four claim states: verified, corrected, unproven, injection-blocked — header shows % verified
- Follow-up email drafted **only from verified claims**
- Export Markdown / JSON + shareable link
- Brightsmile × CallForge deal arc (six calls) plus one-shot samples in `sample-calls/` — click-to-play audio on the arc
- **Live call** at `/live` — scripted offline stream **or** mic → Hear → gates
- Search across past runs on the home page
- Methodology scorecard tab on `/runs/[id]` — MEDDIC (and 13 other packs), same L7 receipts; Brightsmile 1 ships offline
- Judge one-pager at `/how` — why the harness is the product
- Network-call audit trail in `DATA-FLOW.md`

## Harness

| Gate | Behavior |
|------|----------|
| Schema | Bad JSON never ships |
| Evidence | L7 chain: exact → normalized (no digit folding) → unique rescue → **demote, don't hide** |
| Injection | Separate taint screen; planted lines stay visible and never enter email |
| Email choke | Drafts only `verified` / `segment_corrected` claims; unknown ids reject the whole draft |
| Retry | Schema / zero-receipt runs retry with reason (capped) |
| Status | `shipped` / `partial` / `failed` from coverage %; sandbox 401 remints; daily cap is a named exit |
| Budget | Attempts + deadline governor |
| Methodology | Depth 0–3 per trait; deal-band rigor; evidence re-gated; demo verdict on Brightsmile 1 |

## Demo script (90 seconds)

1. Homepage — Brightsmile × CallForge deal strip. Line: *Gong asks you to trust its summary. We show you the line.*
2. Run **Brightsmile 3 · Pricing**. Click a green receipt — audio plays that second. Silence.
3. Grey claim: *Rep agreed to match RingHawk's twenty two…* — planted fake, demoted.
4. Run **Brightsmile 6 · Messy**. Red injection, struck through. Follow-up email does not contain it.
5. Search **`tcpa`** (after running call 2 + 4) — promised Friday, dropped on the ledger call.
6. Optional encore: `/live` mic or upload. Recap notes that cannot re-find a quote stay grey.
7. Optional: run **Brightsmile 1 · Discovery**, open the Scorecard tab — MEDDIC depth with the same receipts; champion is out of band on a $30k deal.
8. `/how` if judges ask. Close: *It's a git clone.*

## Known limitations (on purpose)

- Hyphen/slash quotes can demote an honestly-cited claim (`follow-up` vs `follow up`). We prefer a false demotion to loosening the matcher — digit folding stays refused.
- The injection screen is best-effort. Novel phrasings can slip it; the email choke and visible quarantine contain what it misses.
- The gate proves the line was said, not that the claim's *reading* is fair. "Right quote, wrong claim" is unsolved.
- English-only transcription today (provider constraint).

## Scripts

```bash
npm run dev
npm run build
npm run start        # production (standalone)
npm run test:gates   # receipt / schema gate unit tests
npm run smoke        # offline sample → shipped notes
```

## Deploy on Railway

Repo is Dockerfile + `railway.toml` ready (standalone Next.js).

1. [New project](https://railway.app/new) → **Deploy from GitHub** → `sarithakonudula/open-gong-lite`
2. **Variables** (service → Variables):

| Variable | Value |
|----------|--------|
| `PYAI_API_KEY` | your `pyai_test_` / `pyai_live_` key |
| `PYAI_BASE_URL` | `https://api.pyai.com/v1` |
| `OPENGONG_AUTO_MINT_SANDBOX` | `false` (recommended in prod) |
| `OPENGONG_DEMO_WITHOUT_KEY` | `true` (samples still work) |

Optional: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` if Recap isn’t on the org.

3. **Networking** → Generate domain.
4. Optional volume: mount at `/app/data` so run history survives redeploys (`OPENGONG_DATA_DIR` is already `/app/data` in the image).
5. Healthcheck: `GET /api/health` (configured in `railway.toml`).

Samples and `/how` work without a key. Upload / mic Hear need `PYAI_API_KEY`.

### Login (optional)

Set these in Railway Variables (or `.env`) to require `/login`:

```
OPENGONG_AUTH_USER=demo
OPENGONG_AUTH_PASSWORD=your-strong-password
OPENGONG_SESSION_SECRET=long-random-string
OPENGONG_AUTH_HINT=           # optional text on login form
```

Leave `OPENGONG_AUTH_PASSWORD` empty to keep the app open (no login). Share links (`/share/…`) stay public either way.

Official PyAI references:

- [Build your own Gong](https://docs.pyai.com/use-cases/build-your-own-gong)
- [Recap call intelligence](https://docs.pyai.com/guides/recap-call-intelligence)

Runs on PyAI.
