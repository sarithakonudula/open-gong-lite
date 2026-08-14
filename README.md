# OpenGong Lite

**Gong's job, free.** Upload a sales call and get notes you can check.

Like Perplexity cites its sources, but for sales calls. Every line of the notes carries a citation to the moment in the recording, and the app checks every citation before it ships. Click any line and the transcript jumps to the sentence it came from. With uploaded audio, it plays that second.

If the AI writes something it cannot point to in the call, that line is neither quietly deleted nor quietly kept. It stays on the page, marked **not found in the call**, and it never reaches the follow-up email.

> Gong asks you to trust its summary. We show you the line.

MIT. Node 20+. 312 gate tests passing offline, plus 21 adversarial vectors. The demo needs no keys.

[Quickstart](#quickstart) · [The claim contract](#the-claim-contract) · [Action layer](#action-layer) · [What leaves your machine](DATA-FLOW.md) · [Security](SECURITY.md)

![The recordings workspace: transcript with speaker labels, audio that plays from any line, and call insights beside it](public/hero.png)

## What this does

**For whoever owns the deal:**

- Upload a recording, or paste the link your recorder gave you: Fathom, Fireflies, Google Drive, Loom, Zoom, Gong or direct media
- Cited notes per call: summary, objections, intent, next steps, pain, pricing, competitors. Click a note and the transcript jumps there; with audio, it plays that second
- Scorecards against 14 sales methodology packs, plus Support Excellence (QA) and Customer Success scorecards. A deterministic classifier detects the call type and routes to the right one
- A momentum score per deal, 0 to 100 with direction, computed from gated claims only, every reason carrying a transcript receipt
- Deal signals: what was promised and never picked up again, what the buyer pushed back on twice, who went quiet. Alerts go to Slack; pushable ones become HubSpot tasks
- One-click HubSpot write-back: momentum properties, next action, risk level, and the full cited notes as a deal note
- A management digest per deal, one click to Slack or copy as markdown
- A rep coaching loop: per-rep trait trends across calls, with drills built from the rep's own gate-passed quotes
- Search across past calls, export to Markdown or JSON, shareable links

**For whoever reads the code:**

- The checker is deterministic code. Four claim states are code contracts with tests behind them: `verified`, `segment_corrected`, `uncorroborated`, `blocked_injection`. `src/lib/labels.ts` is the only place they turn into words
- The email choke accepts checked claims and refuses transcripts. A line citing anything the gate did not pass rejects the whole draft
- Every laundering trick that ever beat the checker is a permanent test in `scripts/test-fabrication.ts`
- Admin settings are editable at runtime on `/admin`, secrets masked and encrypted at rest
- Every outbound network call is listed in [`DATA-FLOW.md`](DATA-FLOW.md)

## How it works

```
 recording or pasted link
      │
      ▼
 transcript              PyAI Hear; speaker labels from channel or
      │                  word-level speakers
      ▼
 notes                   PyAI Recap, or a local reader when Recap
      │                  is unavailable
      ▼
 THE GATE                deterministic code; every claim must cite a line
      │                  that exists in the call
      │
      │   the cited line exists ......... claim ships, citation attached
      │   the model cited the wrong line  code finds the right one, labels the fix
      │   no line supports the claim .... stays on screen, marked
      │   the line attacks the model .... struck out, barred from notes and email
      ▼
 consumers               scorecards · momentum · signals · digest ·
      │                  coaching · HubSpot write-back
      ▼
 THE EMAIL CHOKE         drafts assemble from checked claims only; one bad
                         citation kills the whole draft
```

**Core principle:** nothing unchecked leaves the system. The model proposes, code verifies, and everything downstream (scorecards, momentum, signals, digest, CRM) consumes verified claims only. No feature gets an exception.

## Quickstart

```bash
git clone https://github.com/sarithakonudula/open-gong-lite
cd open-gong-lite
npm install
npm run dev
```

Then open http://localhost:3000, hit **Load sample data**, and explore. No API keys needed for the demo. A free PyAI sandbox key creates itself on first transcription (the console tells you when it does). Stereo WAV files get exact speaker labels; mono files transcribe fine but speakers stay unlabeled, and the page says so.

Thirteen sample calls ship in `sample-calls/`, including the six-call Brightsmile deal, a Fireflies displacement call, and a deliberately messy one with a planted injection. Upload WAV for anything that matters; some m4a encodings get rejected upstream.

### Configuration (all optional)

Copy `.env.example` to `.env` only if you have a real `PYAI_API_KEY` or want the login screen. Everything else has working defaults, and admin values set on `/admin` win over env vars.

Live scoring of your own calls needs any OpenAI-compatible endpoint. Two free routes:

```bash
# Ollama, fully local, no signup:
ollama pull llama3.1
LLM_BASE_URL=http://localhost:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=llama3.1

# Groq, hosted free tier (key from console.groq.com):
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=gsk_...
LLM_MODEL=llama-3.3-70b-versatile
```

Restart the dev server after setting these; config is read at boot. Running a shared deployment on your own key is fine: the key stays server-side. Set `OPENGONG_AUTH_PASSWORD` first, and put a spend cap on the key in your provider's console.

## The claim contract

Every note lands in exactly one of four states:

| On screen | In the code | Meaning |
|---|---|---|
| backed | `verified` | The cited line exists in the call |
| backed, citation corrected | `segment_corrected` | The model cited the wrong line; code found the right one and labeled the fix |
| not found in the call | `uncorroborated` | No line supports it, so it stays visible, marked |
| blocked | `blocked_injection` | The line tried to instruct the model; struck out, barred from notes and email |

The citation check runs four ways, in order: exactly as written, then ignoring case and punctuation (never folding digits, and never fusing "40.15" into "4015"), then anywhere in the call if the quote is long and appears once, and otherwise the note is marked not found. Empty quotes, whitespace and quotes under 15 characters anchor nothing.

Three rounds of adversarial review found five ways to launder an invented line past the checker. `scripts/test-fabrication.ts` holds each one closed:

- Empty and whitespace quotes anchoring a note, because `includes("")` is always true
- "4015" assembled out of a spoken "40.15" by stripping punctuation
- Recap sentences with no supporting line getting a citation manufactured for them
- The local reader riding a fallback line when its pattern found nothing
- A hand-written email body shipping on the strength of one passing citation

## It caught its own summarizer inventing a price

We ran the whole chain live on one PyAI key: 86 seconds of audio through Hear for the transcript, then Recap for the notes. Recap's headline said the buyer was switching for "$15 per seat." Nobody said that on the call. The incumbent was twenty-eight a month, a competitor countered twenty-two, and the buyer asked for fifteen off. Recap fused a discount ask into a price nobody spoke.

The checker went looking for a line that could back it, found none, marked the note **not found in the call**, and left it out of the follow-up email. The two objections that carried real quotes came through backed.

## Try to break it

The attack suite that keeps the checker honest ships in this repo:

```bash
npm run test:gates   # 312 passing assertions: shape, citations, planted instructions, email, speakers, scorecards
npx tsx vectors.ts   # 21 adversarial vectors, one verdict line each
```

A quote or number that was never spoken coming back **backed** is a bug. If you find one, that is the bug worth filing.

## Action layer

Gong records what happened. This layer does what was promised, and it keeps the receipts discipline: nothing reaches the CRM, an email, a manager or a coaching drill unless it passed the evidence gate.

| Piece | What it does | Where |
|-------|--------------|-------|
| **Admin settings** | LLM endpoint/key/model, prompt guidance, HubSpot token, Slack webhook, risk threshold, editable at runtime with no restart. Secrets masked, stored server-side in `data/settings.json`. | `/admin` |
| **Scoring LLM chain** | Configure multiple OpenAI-compatible providers as an ordered chain: first is primary, the rest fail over on error or rate limit. Every LLM surface (extraction, methodology scoring, contextual email, coaching) routes through it. Per-provider keys are masked, encrypted at rest, and cleared if the provider's base URL changes. | `/admin` |
| **Language filter** | Toggleable. Options come from what PyAI reports as available. When on, calls detected outside the allowed set are refused LLM scoring. | `/admin` |
| **Recording links** | Paste Fathom, Fireflies, Google Drive, Loom, Zoom, Gong or direct media links. Names embedded in the link become the call title; ids and tokens are dropped. Share pages are scraped for their media, SSRF-guarded. | homepage |
| **HubSpot write-back** | One click on a run: creates and writes `ai_momentum_score`, `ai_momentum_direction`, `ai_next_action`, `ai_last_followup`, `ai_risk_level`, and logs the full cited notes as a deal note. Risk alerts become HubSpot tasks. | run page, `POST /api/hubspot/sync` |
| **Momentum score** | Deterministic 0 to 100 plus direction (advancing / steady / stalling / at-risk) from gated claims only. Every reason carries a transcript receipt. | digest, CRM properties |
| **Contextual follow-up email** | The LLM drafts from verified claims and CRM context only; it never sees the transcript. Output is post-gated: an unproven citation rejects the whole draft and the deterministic baseline ships instead. | run page, `POST /api/email/contextual` |
| **Deal-risk warnings** | `POST /api/signals/scan` (hit it from any cron) scans open HubSpot deals, or stored runs keyless, through the signal rule engine. Alerts at your threshold go to Slack. | `/api/signals/scan` |
| **Management digest** | Per-deal rollup: momentum, verified highlights with receipts, open objections, risks, next steps. One click to Slack or copy as markdown. | `/digest` |
| **Rep training loop** | Scorecards persist per run. Per-rep trait trends across calls, with drills pairing the pack's coaching content with the rep's own gate-passed quotes. | `/coach` |
| **Multi-call-type scoring** | A deterministic classifier (with cited marker lines) detects sales, support or customer success and routes to the right scorecard: 14 sales packs, Support Excellence (QA), or Customer Success (Health & Renewal). Support and CS calls never write momentum to a deal. | run page, `/digest`, `/coach` |

HubSpot setup: create a [private app](https://developers.hubspot.com/docs/api/private-apps) with `crm.objects.contacts/companies/deals/notes/tasks` read+write and `crm.schemas.deals.write`, paste the token on `/admin` or set `HUBSPOT_ACCESS_TOKEN`. Slack: paste an incoming-webhook URL. Everything degrades gracefully: no HubSpot means drafts stay local, no Slack means alerts stay on `/signals`, no LLM means deterministic drafts.

Security posture:

- **Deal writes need a confirmed target.** Name matching only proposes candidates; a write happens when there is exactly one open deal, an explicit pick, or a previously confirmed link. Wrong-deal write-back by fuzzy match cannot happen.
- **`/admin` is hard-locked in production** unless `OPENGONG_AUTH_PASSWORD` is set. Changing the LLM base URL clears the saved key, so a stored key can never be replayed against a new host.
- **Settings secrets are encrypted at rest** (AES-256-GCM keyed off `OPENGONG_SESSION_SECRET`).
- **API responses are projections**: share tokens and transcripts never leave the server through `/api/digest`. Set `OPENGONG_SHARE_TTL_DAYS` to expire share links.

## The follow-up email

The email at the bottom of a run is always the deterministic one: gate-passed notes, one bullet each, no model in the loop. When a model tier is available, a second variant appears beside it, routed from the eight template files in `templates/`. Each template declares what a call has to carry before it fires (a dated next step, an addressed objection, a price on the table). Highest-priority match wins, and a call that matches nothing gets no second variant.

The model only ever sees the template and the claims the gate passed, never the transcript. Its draft comes back through the same screen the baseline goes through: a line with no citation is cut and counted, a line citing anything the gate did not pass rejects the whole draft, and the subject always comes from the template file.

Which model writes it: a configured `LLM_API_KEY` endpoint first, then a local Ollama on `127.0.0.1:11434` probed once for half a second, and with neither the page renders exactly as it does with no keys at all.

## Repository layout

```
open-gong-lite/
├── src/
│   ├── app/                 ← Next.js routes: runs, /digest, /coach, /signals,
│   │                          /admin, /live, /share, /how
│   ├── components/          ← the workspace UI
│   └── lib/                 ← the gate, the choke, scoring, labels.ts
├── sample-calls/            ← 13 committed calls, audio included
├── templates/               ← 8 follow-up templates with routing triggers
├── scripts/                 ← the test suite (test:gates) and build helpers
├── data/                    ← runtime state, gitignored where it matters
├── vectors.ts               ← 21 adversarial vectors
├── DATA-FLOW.md             ← every network call this app makes
├── SECURITY.md
└── Dockerfile + railway.toml
```

## What leaves your machine

The app and your notes run from this folder. Audio goes to PyAI for transcription, and optionally to the LLM endpoint you configured to write notes and drafts. HubSpot and Slack are only contacted if you paste a token or webhook. [`DATA-FLOW.md`](DATA-FLOW.md) lists every outbound call, because "trust us" is the exact thing this project exists to replace.

## You'll hate this if

- You want a bot in your meetings. There is no bot. You bring the recording, or paste the link your recorder already made.
- You want everything to stay on your machine. Audio goes to PyAI for transcription. If that is a blocker, self-host the endpoints or stop here.
- You want the AI's reading of a line to be beyond question. The check proves the line was said. Whether the note is a fair reading of it is unchecked, and we say so. The citation lets you judge in one click.
- You sell in Spanish. Transcription is English-only today, an upstream constraint.
- You expect fuzzy matching to be forgiving. Hyphens and slashes can cost an honest note its citation (`follow-up` against `follow up`). We would rather lose a true note than loosen the checker.
- You want every section filled. Quiet calls come back with empty sections, because an empty section is the honest answer.

## Demo script (90 seconds)

1. Homepage. The Brightsmile deal strip, the PyAI key status line. Line: *Gong asks you to trust its summary. We show you the line.*
2. Run **Brightsmile 3 · Pricing**. Click a citation under an objection. The transcript jumps and the audio plays that second.
3. Point at the grey note: *Rep agreed to match RingHawk's twenty two.* Nobody said it, so it is marked not found in the call.
4. Run **Brightsmile 6 · Messy**. The planted instruction is struck through and stays on the page. Open the follow-up. Neither trap is in the email.
5. Search **`tcpa`** across past calls. Promised on Friday, never picked up again on the ledger call.
6. Run **Brightsmile 1 · Discovery**, open the Scorecard tab. Same citations under the coaching.
7. Optional: `/live` for the scripted stream or mic capture, `/how` for what gets checked and in what order.
8. Line: *People pay Gong $1,400 a seat for this. Ours is a git clone.*

## Scripts

```bash
npm run dev
npm run build
npm run start        # production (standalone)
npm run lint
npm run test:gates   # 312 passing assertions, offline
npx tsx vectors.ts   # 21 adversarial vectors
npm run smoke        # offline sample → notes on the page
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

Optional: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` if Recap isn't on the org.

3. **Networking** → Generate domain.
4. Optional volume: mount at `/app/data` so past calls survive redeploys (`OPENGONG_DATA_DIR` is already `/app/data` in the image).
5. Healthcheck: `GET /api/health` (configured in `railway.toml`).

Samples and `/how` work without a key. Upload and mic need `PYAI_API_KEY`.

### Login (optional)

Set these in Railway Variables (or `.env`) to require `/login`:

```
OPENGONG_AUTH_USER=demo
OPENGONG_AUTH_PASSWORD=your-strong-password
OPENGONG_SESSION_SECRET=long-random-string
OPENGONG_AUTH_HINT=           # optional text on login form
```

Leave `OPENGONG_AUTH_PASSWORD` empty to keep the app open. Share links (`/share/…`) stay public either way.

## The two repos

This repo is the app: upload, live mic, search, scorecards, signals, CRM write-back, share links. The verification engine and methodology system it is built on lives at [souravmohanty-web/opengong-lite](https://github.com/souravmohanty-web/opengong-lite). Same gate, same discipline, one project.

Official PyAI references: [Build your own Gong](https://docs.pyai.com/use-cases/build-your-own-gong) · [Recap call intelligence](https://docs.pyai.com/guides/recap-call-intelligence)

MIT licensed. Runs on [PyAI](https://docs.pyai.com/quickstart); a free sandbox key mints itself on first transcription.

---

Still reading? Then you're the kind of person who checks citations, and we like you already. Run the messy call. We made it ugly on purpose: crosstalk, mumbling, and one line that tries to sweet-talk the model into a forty percent discount. The gate does not find it charming.
