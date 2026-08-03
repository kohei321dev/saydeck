"use client";

import { useState } from "react";

import type { AiProviderCode, AiProviderDescriptor } from "@/lib/ai-config";
import type { AiProviderProbe, AiProviderSettings } from "@/lib/ai-provider-settings";

type Props = {
  initialSettings: AiProviderSettings;
};

export function AiProviderSettingsPanel({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [pendingProvider, setPendingProvider] = useState<AiProviderCode | null>(null);
  const [probes, setProbes] = useState<Partial<Record<AiProviderCode, AiProviderProbe>>>({});
  const [notice, setNotice] = useState("");

  async function changeProvider(provider: AiProviderCode) {
    setPendingProvider(provider);
    setNotice("");
    try {
      const response = await fetch("/api/settings/ai", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json().catch(() => null) as AiProviderSettings & {
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload) {
        throw new Error(payload?.error?.message ?? "AI providerを変更できませんでした。");
      }
      setSettings(payload);
      setNotice(`${providerLabel(payload.providers, provider)}へ切り替えました。次回の生成から使用します。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI providerを変更できませんでした。");
    } finally {
      setPendingProvider(null);
    }
  }

  async function probeProvider(provider: AiProviderCode) {
    setPendingProvider(provider);
    setNotice("");
    try {
      const response = await fetch("/api/settings/ai/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json().catch(() => null) as {
        probe?: AiProviderProbe;
        error?: { message?: string };
      } | null;
      if (!response.ok || !payload?.probe) {
        throw new Error(payload?.error?.message ?? "接続を確認できませんでした。");
      }
      setProbes((current) => ({ ...current, [provider]: payload.probe }));
      setNotice(payload.probe.connected
        ? `${providerLabel(settings.providers, provider)}へ接続できました。`
        : `${providerLabel(settings.providers, provider)}へ接続できませんでした。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "接続を確認できませんでした。");
    } finally {
      setPendingProvider(null);
    }
  }

  return (
    <section className="settings-provider-list" aria-label="AI provider設定">
      {settings.providers.map((provider) => {
        const active = settings.activeProvider === provider.provider;
        const probe = probes[provider.provider];
        return (
          <article className={active ? "settings-provider-card active" : "settings-provider-card"} key={provider.provider}>
            <div className="settings-provider-heading">
              <div>
                <p className="eyebrow">{provider.provider.toUpperCase()}</p>
                <h2>{provider.label}</h2>
              </div>
              <span className={active ? "settings-state active" : "settings-state"}>
                {active ? "使用中" : "待機"}
              </span>
            </div>
            <dl className="settings-provider-meta">
              <div><dt>Model</dt><dd>{provider.model}</dd></div>
              <div><dt>API key</dt><dd>{provider.configured ? "設定済み" : "未設定"}</dd></div>
              <div><dt>接続</dt><dd>{probeLabel(probe)}</dd></div>
            </dl>
            <div className="settings-provider-actions">
              <button
                className="secondary-button"
                disabled={!provider.configured || pendingProvider !== null}
                onClick={() => void probeProvider(provider.provider)}
                type="button"
              >
                接続確認
              </button>
              <button
                className="primary-button"
                disabled={active || !provider.configured || pendingProvider !== null}
                onClick={() => void changeProvider(provider.provider)}
                type="button"
              >
                {pendingProvider === provider.provider ? "処理中…" : "このproviderを使う"}
              </button>
            </div>
          </article>
        );
      })}
      {notice ? <p className="capture-notice" role="status">{notice}</p> : null}
      <p className="settings-secret-note">
        API key本体は表示しません。切替は次回のカード生成から適用され、保存済みカードの生成元は変更されません。
      </p>
    </section>
  );
}

function providerLabel(providers: AiProviderDescriptor[], provider: AiProviderCode): string {
  return providers.find((item) => item.provider === provider)?.label ?? provider;
}

function probeLabel(probe?: AiProviderProbe): string {
  if (!probe) return "未確認";
  if (probe.connected) return "接続OK";
  return probe.configured ? `接続失敗${probe.status ? ` (${probe.status})` : ""}` : "API key未設定";
}
