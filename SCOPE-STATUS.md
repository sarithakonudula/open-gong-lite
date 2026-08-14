# Scope vs. delivered — honest status

Last checked: 2026-08-14 · suite 234/234 · build green · browser-verified.

## Delivered (matches or exceeds the scope)

| Scoped ask | Status | Where |
|---|---|---|
| Transcription + notes where every claim cites a transcript line | ✅ | PyAI Hear + L7 gates; unproven claims demoted, never hidden |
| Flow 1: commitment → context-rich follow-up email | ✅ drafting | LLM drafts from verified claims + CRM context only, post-gated; template library routes 8 follow-up shapes |
| Flow 2: stalled-deal revival (time-based) | ✅ | `POST /api/signals/scan` (cron-able) → Slack + HubSpot tasks; `simulateIdleDays` demo lever |
| Flow 3: momentum score → CRM | ✅ | Deterministic 0–100 with receipts → `ai_momentum_*` deal properties |
| Flow 4: similar-deal playbooks | ✅ | `lib/playbook.ts`: HubSpot closed-won/lost mining + gated LLM synthesis; keyless mode mines your own calls and says so |
| HubSpot read/write incl. stage moves | ✅ | Confirm-before-write deal sync; stage moves are suggest-then-approve with an explanatory note |
| Admin: choose LLM model + endpoint, feed scoring | ✅ | Provider chain with checkboxes, ordered failover, encrypted keys, per-provider exfil guard |
| Language filter from PyAI availability | ✅ | Toggle + per-language checkboxes; out-of-language calls refused scoring pre-tokens |
| Deal-at-risk warnings to the rep | ✅ | Slack + HubSpot tasks at admin-set severity threshold |
| Management deal digest | ✅ | `/digest` + `/companies`; one-click Slack |
| Personalized rep training loop | ✅ | Persisted scorecards → trait trends → drills quoting the rep's own lines |
| Sales / support / CS call scoring | ✅ | Kind detection with cited markers; Support QA + CS Health packs; momentum gated to sales |
| Recording links (Fathom/Fireflies/Drive/…), names stripped | ✅ | Resolver + slug→title; folders and login walls get actionable errors |
| electron frontend per design screenshots | ✅ | All 9 screens on real gated data; waveform player, OVERALL SENTIMENT, Ask-electron search, mock-faithful Templates |

## Major letdowns (known, deliberate or deferred — not silent gaps)

1. **Emails never send.** Drafts + HubSpot note logging only — no send button, no
   email-engagement write-back. Deferred by explicit decision; the last mile of
   Flow 1's promise ("rep clicks send") does not exist.
2. **Factors.ai intent trigger is unwired.** `POST /api/signals` accepts
   external signals, but no Factors connector feeds it — stalled-deal revival is
   time-based only.
3. **"Ask electron" is search, not a Q&A agent.** The design's natural-language
   prompt chips filter/search; they do not answer questions.
4. **"Sentiment" is a proxy.** The UI number is deal momentum (sales) or receipt
   coverage (support/CS) — deterministic and receipt-backed, labeled in the UI.
   There is no tonal sentiment model.
5. **Flow 4 is only as good as the history.** Against an empty/demo HubSpot
   portal it degrades to the local-calls mode (honestly labeled); real
   playbooks need real closed-won/lost data.
6. **Template automation criteria are local-only.** The criteria panel persists
   to the browser; actual routing still comes from gated claims. There is no
   calendar/meeting-metadata backend to honor "title contains" rules.
7. **Single-workspace by design.** Team/Billing settings are placeholders;
   auth is one shared login via env vars; run store is flat JSON files (no
   multi-user concurrency).
8. **Provider constraints stand.** English-only transcription today; audio
   leaves the machine to PyAI; call-kind and language detection are
   keyword/stopword heuristics with human override.
9. **CI on the aakash-test copy is dormant** until `.github/ci.yml.pending` is
   moved to `.github/workflows/ci.yml` in the GitHub UI (push tokens lack the
   `workflow` scope).
