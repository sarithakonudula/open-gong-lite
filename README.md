# OpenGong Lite

**Gong’s job, free.** Upload a sales call → get deal notes with receipts.

Every claim points to the exact line in the transcript. Unproven claims stay visible and never pretend to be facts. Prompt-injection lines are quarantined and barred from the follow-up email.

![OpenGong Lite: deal notes with receipts](./public/screenshot.png)

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

Open [http://localhost:3000](http://localhost:3000). Samples work immediately, no key needed.

- **Samples** work with zero config. Click any sample → cited notes in seconds.
- **Live ingest** (upload a real call) auto-mints a free `pyai_test_` sandbox key on first use. No signup, no card. The key is stored in gitignored `data/.pyai-sandbox-key.json` and reused on later runs.
- **Optional:** copy `.env.example` to `.env` to set a real `PYAI_API_KEY` or enable the login gate.

### Env (all optional)

```bash
# Live key. Leave blank to auto-mint a free sandbox key on first upload
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

## What you get

- Diarized transcript with speaker labels
- Summary, objections, intent, next steps, pain / pricing / competitors
- **Receipts**: click a claim → jump to the transcript line (and play that second when audio was uploaded)
- Four claim states: verified, corrected, unproven, injection-blocked. The header shows % verified
- Follow-up email drafted **only from verified claims**
- Export Markdown / JSON + shareable link
- Seven sample calls in `sample-calls/` (Fireflies displacement + a messy injection call)
- **Live call** at `/live`: scripted offline stream **or** mic → Hear → gates
- Search across past runs on the home page
- Judge one-pager at `/how`: why the harness is the product
- Network-call audit trail in `DATA-FLOW.md`

## Harness

| Gate | Behavior |
|------|----------|
| Schema | Bad JSON never ships |
| Evidence | L7 chain: exact → normalized (no digit folding, no digit fusion: punctuation between digits never fuses "40.15" into "4015") → unique rescue → **demote, don't hide**. Empty, whitespace, and sub-15-char quotes never anchor a claim |
| Injection | Separate taint screen; planted lines stay visible and never enter email |
| Email choke | The email is always composed from `verified` / `segment_corrected` claims. A model- or Recap-authored body never ships, even when its own receipt passes. Unknown ids reject the whole draft |
| Retry | Schema / zero-receipt runs retry with reason (capped) |
| Status | `shipped` / `partial` / `failed` from coverage %; sandbox 401 remints; daily cap is a named exit |
| Budget | Attempts + deadline governor |

The gate earned these rows the hard way: every fabrication path found across three adversarial audit rounds (empty-quote anchoring, digit-fusion laundering, self-certified Recap receipts, invented next steps, curated email bodies riding one passing receipt) is closed and kept closed by `scripts/test-fabrication.ts`, which runs in `npm run test:gates`.

## Demo script (90 seconds)

1. Homepage. Brand hits first; note the PyAI key status line.
2. Run **Basecamp Retail / Fireflies** (or Acme pricing pushback).
3. Click an objection receipt; transcript jumps.
4. Run **Messy call (planted lie + injection)**. Point at the grey unproven claim and the struck-through injection. Note % verified. Open the follow-up. Neither trap is in the email.
5. Optional: `/live` → scripted demo **or** Record mic → End call (click receipt plays that second).
6. Open `/how` for one sentence on gates if judges ask.
7. Share link / Copy share URL + export Markdown.
8. Line: *People pay Gong $1,400 a seat for this. Ours is a git clone.*

## Known limitations (on purpose)

- Hyphen/slash quotes can demote an honestly-cited claim (`follow-up` vs `follow up`). We prefer a false demotion to loosening the matcher. Digit folding stays refused.
- The injection screen is best-effort. Novel phrasings can slip it; the email choke and visible quarantine contain what it misses.
- The gate proves the line was said, not that the claim's *reading* is fair. "Right quote, wrong claim" is unsolved.
- English-only transcription today (provider constraint).
- When a claim's pattern or Recap sentence has no supporting line, the claim is demoted, not decorated. Sections can come back empty on quiet calls. That is the point.

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

Optional: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` if Recap isn't on the org.

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
