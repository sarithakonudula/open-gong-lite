# OpenGong Lite

**Gong’s job, free.** Upload a sales call → get deal notes with receipts.

Every claim points to the exact line in the transcript. Unproven claims never ship.

![OpenGong Lite — deal notes with receipts](./public/screenshot-placeholder.svg)

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
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Samples** work with zero keys.
- **Live ingest** uses `PYAI_API_KEY`, or auto-mints a `pyai_test_` sandbox key
  via `POST /v1/sandbox/keys` (stored in gitignored `data/.pyai-sandbox-key.json`).

### Env

```bash
PYAI_API_KEY=pyai_test_...          # or pyai_live_...
PYAI_BASE_URL=https://api.pyai.com/v1
PYAI_HEAR_MODEL=pyai-hear
PYAI_HEAR_JOB_MODEL=pyai-hear-telephony
PYAI_RECAP_PACK_ID=sales_outbound

# Optional if Recap add-on is unavailable
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
```

Scopes for the full live path:

- `hear:transcribe` + `transcribe:jobs` (Hear batch)
- `recap:read` (+ `recap:configure` once to enable)

## What you get

- Diarized transcript with speaker labels
- Summary, objections, intent, next steps, follow-up email
- **Receipts**: click a claim → jump to the transcript line
- Export Markdown / JSON + shareable link
- Six sample calls in `sample-calls/` (incl. Fireflies competitive displacement)
- **Live call** at `/live` — scripted offline stream **or** mic → Hear → gates
- Search across past runs on the home page
- Judge one-pager at `/how` — why the harness is the product

## Harness

| Gate | Behavior |
|------|----------|
| Schema | Bad JSON never ships |
| Evidence | L7 chain: exact → normalized (no digit folding) → unique rescue → unproven |
| Retry | Failed parts retry with reason (capped) |
| Status | Every run ends `shipped` / `partial` / `failed` |
| Budget | Attempts + deadline governor |

## Demo script (90 seconds)

1. Homepage — brand hits first; note PyAI key status line.
2. Run **Basecamp Retail — Fireflies** (or Acme pricing pushback).
3. Click an objection receipt; transcript jumps.
4. Optional: `/live` → scripted demo **or** Record mic → End call.
5. Open `/how` for one sentence on gates if judges ask.
6. Share link / Copy share URL + export Markdown.
7. Line: *People pay Gong $1,400 a seat for this. Ours is a git clone.*

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
