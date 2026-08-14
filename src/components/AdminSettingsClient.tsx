"use client";

import { useEffect, useState } from "react";

type LlmProvider = {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
};

type Masked = {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  llmProviders: LlmProvider[];
  languageFilterEnabled: boolean;
  allowedLanguages: string[];
  extractionGuidance: string;
  emailGuidance: string;
  coachingGuidance: string;
  hubspotToken: string;
  slackWebhookUrl: string;
  riskNotifyFloor: "hot" | "high" | "watch";
  hasLlm: boolean;
  hasHubspot: boolean;
  hasSlack: boolean;
};

const EMPTY: Masked = {
  llmBaseUrl: "",
  llmApiKey: "",
  llmModel: "",
  llmProviders: [],
  languageFilterEnabled: false,
  allowedLanguages: ["en"],
  extractionGuidance: "",
  emailGuidance: "",
  coachingGuidance: "",
  hubspotToken: "",
  slackWebhookUrl: "",
  riskNotifyFloor: "high",
  hasLlm: false,
  hasHubspot: false,
  hasSlack: false,
};

type LanguageOption = { code: string; label: string; available: boolean };
type PyaiOptions = {
  hearModels: string[];
  languages: LanguageOption[];
  source: "pyai" | "fallback";
};

function Field(props: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  secret?: boolean;
}) {
  const shared =
    "mt-1 w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-brand";
  return (
    <label className="block">
      <span className="text-sm font-medium">{props.label}</span>
      {props.hint && <span className="ml-2 text-xs text-fg-soft">{props.hint}</span>}
      {props.textarea ? (
        <textarea
          className={`${shared} min-h-20`}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          className={shared}
          type={props.secret ? "password" : "text"}
          value={props.value}
          placeholder={props.placeholder}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function StatusDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs uppercase tracking-wide ${on ? "border-brand text-brand" : "border-edge/40 text-fg-soft"}`}
    >
      {label}: {on ? "on" : "off"}
    </span>
  );
}

export function AdminSettingsClient() {
  const [settings, setSettings] = useState<Masked>(EMPTY);
  const [pyaiOptions, setPyaiOptions] = useState<PyaiOptions | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [locked, setLocked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/settings")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setLocked(data.error || "Admin is locked.");
        } else if (data.settings) {
          setSettings(data.settings);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    fetch("/api/admin/pyai-options")
      .then((r) => r.json())
      .then((data) => setPyaiOptions(data.options ?? null))
      .catch(() => null);
  }, []);

  const setProvider =
    (id: string) => (patch: Partial<LlmProvider>) =>
      setSettings((s) => ({
        ...s,
        llmProviders: s.llmProviders.map((p) =>
          p.id === id ? { ...p, ...patch } : p,
        ),
      }));

  function addProvider() {
    const id = `p${Math.random().toString(36).slice(2, 8)}`;
    setSettings((s) => ({
      ...s,
      llmProviders: [
        ...s.llmProviders,
        { id, label: "", baseUrl: "", apiKey: "", model: "", enabled: true },
      ],
    }));
  }

  function removeProvider(id: string) {
    setSettings((s) => ({
      ...s,
      llmProviders: s.llmProviders.filter((p) => p.id !== id),
    }));
  }

  function toggleLanguage(code: string) {
    setSettings((s) => {
      const has = s.allowedLanguages.includes(code);
      const next = has
        ? s.allowedLanguages.filter((c) => c !== code)
        : [...s.allowedLanguages, code];
      // The filter needs at least one language to mean anything.
      return { ...s, allowedLanguages: next.length > 0 ? next : s.allowedLanguages };
    });
  }

  const set = (key: keyof Masked) => (value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save failed");
      setSettings(data.settings);
      setMessage("Saved — takes effect immediately, no restart.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function runTest(kind: "llm" | "hubspot" | "slack") {
    setTests((t) => ({ ...t, [kind]: "…" }));
    try {
      const response = await fetch("/api/admin/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await response.json();
      setTests((t) => ({
        ...t,
        [kind]: `${data.ok ? "✅" : "❌"} ${data.detail ?? data.error ?? ""}`,
      }));
    } catch {
      setTests((t) => ({ ...t, [kind]: "❌ request failed" }));
    }
  }

  if (!loaded) {
    return <p className="text-sm text-fg-soft">Loading settings…</p>;
  }

  if (locked) {
    return (
      <p className="rounded-lg border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
        {locked}
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <StatusDot on={settings.hasLlm} label="LLM" />
        <StatusDot on={settings.hasHubspot} label="HubSpot" />
        <StatusDot on={settings.hasSlack} label="Slack" />
      </div>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          Scoring LLM chain
        </h2>
        <p className="mt-1 text-sm text-fg-soft">
          Checked providers feed the scoring system in order — the first is
          primary, the rest are failover. Unchecked entries are stored but
          never called. All extraction, methodology scoring, emails, and
          coaching go through this chain.
        </p>
        <div className="mt-4 space-y-3">
          {settings.llmProviders.map((p) => (
            <div
              key={p.id}
              className="space-y-2 rounded-lg border border-edge bg-surface p-3"
            >
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) =>
                      setProvider(p.id)({ enabled: e.target.checked })
                    }
                  />
                  use for scoring
                </label>
                <input
                  className="min-w-[8rem] flex-1 rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm"
                  placeholder="Label (e.g. Groq primary)"
                  value={p.label}
                  onChange={(e) => setProvider(p.id)({ label: e.target.value })}
                />
                <button
                  className="text-xs text-danger/80 hover:text-danger"
                  onClick={() => removeProvider(p.id)}
                >
                  remove
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm"
                  placeholder="Base URL (https://…/v1)"
                  value={p.baseUrl}
                  onChange={(e) => setProvider(p.id)({ baseUrl: e.target.value })}
                />
                <input
                  className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm"
                  type="password"
                  placeholder="API key"
                  value={p.apiKey}
                  onChange={(e) => setProvider(p.id)({ apiKey: e.target.value })}
                />
                <input
                  className="rounded-lg border border-edge bg-surface px-3 py-1.5 text-sm"
                  placeholder="Model id"
                  value={p.model}
                  onChange={(e) => setProvider(p.id)({ model: e.target.value })}
                />
              </div>
            </div>
          ))}
          <button className="btn-ghost" onClick={addProvider}>
            + Add provider
          </button>
        </div>

        <h3 className="mt-6 text-sm font-medium">
          Default endpoint (chain fallback)
        </h3>
        <p className="mt-1 text-xs text-fg-soft">
          Used when no checked provider answers. Saved values win over LLM_*
          env vars and apply without a restart.
        </p>
        <div className="mt-4 space-y-4">
          <Field
            label="Base URL"
            hint="changing this clears the saved key — re-enter it"
            placeholder="https://api.groq.com/openai/v1"
            value={settings.llmBaseUrl}
            onChange={set("llmBaseUrl")}
          />
          <Field
            label="API key"
            secret
            value={settings.llmApiKey}
            onChange={set("llmApiKey")}
          />
          <Field
            label="Model"
            placeholder="llama-3.3-70b-versatile"
            value={settings.llmModel}
            onChange={set("llmModel")}
          />
          <Field
            label="Extraction guidance"
            hint="appended to the extractor prompt — gate rules always win"
            textarea
            value={settings.extractionGuidance}
            onChange={set("extractionGuidance")}
          />
          <Field
            label="Email guidance"
            hint="tone/structure for the contextual follow-up"
            textarea
            value={settings.emailGuidance}
            onChange={set("emailGuidance")}
          />
          <Field
            label="Coaching guidance"
            textarea
            value={settings.coachingGuidance}
            onChange={set("coachingGuidance")}
          />
          <button className="btn-ghost" onClick={() => runTest("llm")}>
            Test LLM
          </button>
          {tests.llm && <span className="ml-3 text-sm text-fg-muted">{tests.llm}</span>}
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          Language filter
        </h2>
        <p className="mt-1 text-sm text-fg-soft">
          Options come from what PyAI reports as available
          {pyaiOptions ? (
            <span>
              {" "}
              ({pyaiOptions.source === "pyai" ? "live from PyAI" : "provider default — English-only transcription today"}
              ; Hear models: {pyaiOptions.hearModels.join(", ")})
            </span>
          ) : null}
          . When the filter is on, calls detected outside the allowed set are
          refused LLM scoring, and the first allowed language is sent to PyAI
          Recap.
        </p>
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.languageFilterEnabled}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  languageFilterEnabled: e.target.checked,
                }))
              }
            />
            Enable language filter
          </label>
          <div className="flex flex-wrap gap-3">
            {(pyaiOptions?.languages ?? [{ code: "en", label: "English", available: true }]).map(
              (lang) => (
                <label
                  key={lang.code}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${lang.available ? "border-edge" : "border-edge/15 text-fg-soft"}`}
                  title={
                    lang.available
                      ? undefined
                      : "Not offered by PyAI yet"
                  }
                >
                  <input
                    type="checkbox"
                    disabled={!lang.available || !settings.languageFilterEnabled}
                    checked={settings.allowedLanguages.includes(lang.code)}
                    onChange={() => toggleLanguage(lang.code)}
                  />
                  {lang.label}
                  {!lang.available && (
                    <span className="text-[10px] uppercase tracking-wide">
                      unavailable
                    </span>
                  )}
                </label>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          HubSpot
        </h2>
        <p className="mt-1 text-sm text-fg-soft">
          Private-app token. Needed scopes: crm.objects (contacts, companies,
          deals, notes, tasks) read/write + crm.schemas.deals.write.
        </p>
        <div className="mt-4 space-y-4">
          <Field
            label="Access token"
            secret
            placeholder="pat-…"
            value={settings.hubspotToken}
            onChange={set("hubspotToken")}
          />
          <button className="btn-ghost" onClick={() => runTest("hubspot")}>
            Test HubSpot
          </button>
          {tests.hubspot && (
            <span className="ml-3 text-sm text-fg-muted">{tests.hubspot}</span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          Notifications
        </h2>
        <div className="mt-4 space-y-4">
          <Field
            label="Slack incoming-webhook URL"
            secret
            placeholder="https://hooks.slack.com/services/…"
            value={settings.slackWebhookUrl}
            onChange={set("slackWebhookUrl")}
          />
          <label className="block">
            <span className="text-sm font-medium">Notify on severity ≥</span>
            <select
              className="mt-1 w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm"
              value={settings.riskNotifyFloor}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  riskNotifyFloor: e.target.value as Masked["riskNotifyFloor"],
                }))
              }
            >
              <option value="hot">hot only</option>
              <option value="high">high + hot</option>
              <option value="watch">watch + high + hot</option>
            </select>
          </label>
          <button className="btn-ghost" onClick={() => runTest("slack")}>
            Test Slack
          </button>
          {tests.slack && (
            <span className="ml-3 text-sm text-fg-muted">{tests.slack}</span>
          )}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {message && <span className="text-sm text-fg-muted">{message}</span>}
      </div>
    </div>
  );
}
