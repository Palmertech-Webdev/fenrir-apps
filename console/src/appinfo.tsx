// Which Fenrir app this server runs (FENRIR_APP on the server, served at /api/app). The console shows only the
// pages of the running app's features; the core (customers, users, settings, audit) is in every app.
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type Feature = "endpoint" | "rmm" | "av" | "vuln" | "crm" | "psa" | "grc" | "m365" | "mobile" | "docs" | "complete";

export interface AppInfo {
  key: string;
  title: string;
  summary: string;
  features: Feature[];
}

const ALL: Feature[] = ["endpoint", "rmm", "av", "vuln", "crm", "psa", "grc", "m365", "mobile", "docs", "complete"];
// An older server without /api/app is the complete platform.
export const COMPLETE: AppInfo = { key: "complete", title: "Fenrir", summary: "The complete platform: every app in one console.", features: ALL };

let request: Promise<AppInfo> | null = null;
export function loadAppInfo(): Promise<AppInfo> {
  request ??= fetch("/api/app", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : COMPLETE))
    .then((info: AppInfo) => (Array.isArray(info?.features) ? info : COMPLETE))
    .catch(() => COMPLETE);
  return request;
}

const Ctx = createContext<AppInfo>(COMPLETE);

export function AppInfoProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => { loadAppInfo().then(setInfo); }, []);
  useEffect(() => { if (info) document.title = info.title; }, [info]);
  if (!info) return <div className="empty">Loading…</div>;
  return <Ctx.Provider value={info}>{children}</Ctx.Provider>;
}

export function useAppInfo(): AppInfo {
  return useContext(Ctx);
}

/** True when the app has any of the features (no features named: part of every app). */
export function hasAny(info: AppInfo, features?: Feature[]): boolean {
  return !features || features.length === 0 || features.some((f) => info.features.includes(f));
}

export function useFeature(...features: Feature[]): boolean {
  return hasAny(useAppInfo(), features);
}

// Pages by the first part of their path, and the features any one of which shows them. A page not listed is core.
export const PAGE_FEATURES: Record<string, Feature[]> = {
  // Antivirus and EDR
  inbox: ["av"], alerts: ["av"], incidents: ["av"], hunt: ["av"], intel: ["av"], rules: ["av"], automations: ["av"],
  "edr-exclusions": ["av"], "soc-workflows": ["av"], quarantine: ["av"], dns: ["av"], "protection-health": ["av"],
  // Devices (every app with an agent)
  devices: ["endpoint"], groups: ["endpoint"], policies: ["endpoint"], deploy: ["endpoint"], "agent-health": ["endpoint"],
  recordings: ["endpoint"],
  // RMM
  monitoring: ["rmm"], patching: ["rmm"], software: ["rmm"], scripts: ["rmm"], "remediation-packages": ["rmm"],
  automation: ["rmm"], "admin-requests": ["rmm"], "out-of-band": ["rmm"], "active-directory": ["rmm"], backup: ["rmm"],
  network: ["rmm"], "network-topology": ["rmm"],
  // Vulnerability management
  vulnerabilities: ["vuln"], exposure: ["vuln"], "attack-surface": ["vuln"], compliance: ["av", "vuln"],
  // Microsoft 365
  m365: ["m365"], "m365-partner": ["m365"],
  // PSA
  companies: ["psa"], configurations: ["psa"], "service-board": ["psa"], "service-desk": ["psa"], tickets: ["psa"],
  dispatch: ["psa"], workload: ["psa"], time: ["psa"], "service-settings": ["psa"], projects: ["psa"], billing: ["psa"],
  // CRM
  crm: ["crm"], quotes: ["crm", "psa"],
  // GRC
  governance: ["grc"], "continuous-compliance": ["grc"],
  // Documentation and vault
  knowledge: ["psa", "docs"], vault: ["docs"],
  // Across apps: only in the complete platform
  onboarding: ["complete"], reports: ["complete"],
};

export function pageAllowed(info: AppInfo, path: string): boolean {
  const first = path.replace(/^\/+/, "").split(/[/?#]/)[0];
  return hasAny(info, PAGE_FEATURES[first]);
}
