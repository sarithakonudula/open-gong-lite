# DATA-FLOW.md

Every outbound network call this codebase can make, traced to the line that
makes it. OpenGong Lite is a **self-hosted app with hosted inference** — never
"fully local." Audio goes to PyAI; optional extraction may go to Recap (same
PyAI org) or an OpenAI-compatible LLM.

## Outbound calls

| # | Trigger | Method + endpoint | Vendor | Payload leaving the machine | Call site |
|---|---|---|---|---|---|
| 1 | First live ingest with no `PYAI_API_KEY` | `POST /v1/sandbox/keys` | PyAI | Label only — no audio, no transcript | `src/lib/pyai-key.ts:60` |
| 2 | Upload / URL / mic transcribe | `POST /v1/transcription/jobs` (+ poll `GET /v1/transcription/jobs/:id`) | PyAI | Audio bytes or public https `audio_url` | `src/lib/pyai.ts:114` via Hear helpers |
| 3 | Job result hosted off the JSON body | `GET {result_url}` | PyAI | Job id in the URL; no new content | `src/lib/pyai.ts:172` |
| 4 | Recap deal-intel (when enabled on the org) | `POST/GET /v1/recap/calls/:id` | PyAI | Transcript utterances (text), not audio | `src/lib/pyai.ts:114` |
| 5 | Optional LLM fallback | `POST {LLM_BASE_URL}/chat/completions` | Your LLM host | Transcript text + extractor instructions | `src/lib/llm-extract.ts:45` |
| 6 | Contextual email / admin LLM test | `POST {llm base}/chat/completions` | Your LLM host | **Verified claims + CRM facts only — never the transcript** | `src/lib/llm.ts` via `src/lib/harness/email.ts` |
| 7 | HubSpot read/write (when token set) | `https://api.hubapi.com/crm/*`, `/account-info/*` | HubSpot | Gated notes markdown, momentum properties, task text, company name searched | `src/lib/hubspot.ts` |
| 8 | Slack alerts / digest (when webhook set) | `POST {SLACK_WEBHOOK_URL}` | Slack | Alert titles + gated evidence quotes, digest markdown | `src/lib/notify.ts` |

Rows 6–8 fire only when the admin configures them on `/admin` (or via env);
keyless installs make none of these calls.

401 on a `pyai_test_` sandbox key remints once (`src/lib/pyai.ts` + `remintSandboxKey`). 429 with a long/missing `Retry-After` is a named `PYAI_DAILY_CAP` exit — samples still work offline.

## What never leaves the machine

- Run JSON (`data/runs/`) — claims, evidence, coverage, attempts
- Saved upload/mic audio (`data/audio/`) — served only on the local run page, not on `/share`
- Share pages send notes + transcript to the browser of whoever has the token; the token is unguessable and does not expire yet
- `npm run test:gates` is structurally network-free

## Turn Recap / LLM off

Leave Recap disabled on the key and leave `LLM_*` empty. Samples and the local extractor still ship gated notes.
