# Security

## Reporting

Open a private security advisory on this repository (preferred). Please do not
open public issues for vulnerabilities.

## Scope notes

- This app is self-hosted; inference is hosted (PyAI speech, optional Recap /
  OpenAI-compatible LLM extraction). Every outbound network call is enumerated
  in `DATA-FLOW.md`.
- API keys are never logged or returned to the browser. The PyAI sandbox key is
  stored in `data/.pyai-sandbox-key.json` (gitignored); live keys are read from
  the environment only.
- Transcripts are untrusted input. The follow-up email is built only from
  citation-gate-passed claims. Prompt-injection lines are quarantined in the UI.
- Upload validation: MIME allowlist, 25MB cap. Audio URL ingest is https-only
  and rejects localhost / private / link-local hosts.
- Share links (`/share/{token}`) are unguessable but do not expire. Treat them
  as confidential until expiry/revoke exists.
- CI runs gitleaks on every push.
