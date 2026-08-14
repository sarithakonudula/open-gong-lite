"use client";

import { useEffect, useState } from "react";

type Masked = {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
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
    "mt-1 w-full rounded-lg border border-mist/30 bg-paper/60 px-3 py-2 text-sm text-foreground outline-none focus:border-signal/60";
  return (
    <label className="block">
      <span className="text-sm font-medium">{props.label}</span>
      {props.hint && <span className="ml-2 text-xs text-mist">{props.hint}</span>}
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
      className={`rounded-full border px-2.5 py-0.5 text-xs uppercase tracking-wide ${on ? "border-signal/60 text-signal" : "border-mist/40 text-mist"}`}
    >
      {label}: {on ? "on" : "off"}
    </span>
  );
}

export function AdminSettingsClient() {
  const [settings, setSettings] = useState<Masked>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) setSettings(data.settings);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

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
    return <p className="text-sm text-mist">Loading settings…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <StatusDot on={settings.hasLlm} label="LLM" />
        <StatusDot on={settings.hasHubspot} label="HubSpot" />
        <StatusDot on={settings.hasSlack} label="Slack" />
      </div>

      <section className="rounded-xl border border-mist/25 bg-paper/40 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          LLM
        </h2>
        <p className="mt-1 text-sm text-mist">
          Any OpenAI-compatible endpoint. Saved values win over LLM_* env vars
          and apply without a restart.
        </p>
        <div className="mt-4 space-y-4">
          <Field
            label="Base URL"
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
          {tests.llm && <span className="ml-3 text-sm text-fog">{tests.llm}</span>}
        </div>
      </section>

      <section className="rounded-xl border border-mist/25 bg-paper/40 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg tracking-tight">
          HubSpot
        </h2>
        <p className="mt-1 text-sm text-mist">
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
            <span className="ml-3 text-sm text-fog">{tests.hubspot}</span>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-mist/25 bg-paper/40 p-5">
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
              className="mt-1 w-full rounded-lg border border-mist/30 bg-paper/60 px-3 py-2 text-sm"
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
            <span className="ml-3 text-sm text-fog">{tests.slack}</span>
          )}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {message && <span className="text-sm text-fog">{message}</span>}
      </div>
    </div>
  );
}
