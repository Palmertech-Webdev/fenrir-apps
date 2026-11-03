import { expect, test } from "vitest";
import { NAV } from "../src/App";
import { AppInfo, COMPLETE, Feature, hasAny, PAGE_FEATURES, pageAllowed } from "../src/appinfo";

// The same apps as the server (cloud/fenrir_cloud/apps.py).
const APPS: Record<string, Feature[]> = {
  rmm: ["endpoint", "rmm"], av: ["endpoint", "av"], vuln: ["endpoint", "vuln"], crm: ["crm"], psa: ["psa"], grc: ["grc"],
  m365: ["m365"], mobile: ["endpoint", "mobile"], docs: ["docs"],
};
const app = (key: string): AppInfo => ({ key, title: key, summary: "", features: APPS[key] });
const paths = NAV.flatMap((g) => g.items.map((i) => i.to));

test("the complete platform shows every page", () => {
  expect(paths.every((p) => pageAllowed(COMPLETE, p))).toBe(true);
});

test("each app shows its own pages and the core, and hides the rest", () => {
  for (const key of Object.keys(APPS)) {
    const info = app(key);
    const shown = paths.filter((p) => pageAllowed(info, p));
    expect(shown).toContain("/");
    expect(shown).toContain("/settings");
    expect(shown.length).toBeGreaterThan(2);
    expect(shown.length).toBeLessThan(paths.length);
    for (const p of shown) expect(hasAny(info, PAGE_FEATURES[p.slice(1).split("/")[0]])).toBe(true);
  }
});

test("pages land in the app that owns them", () => {
  expect(pageAllowed(app("rmm"), "/patching")).toBe(true);
  expect(pageAllowed(app("rmm"), "/alerts")).toBe(false);
  expect(pageAllowed(app("av"), "/alerts")).toBe(true);
  expect(pageAllowed(app("av"), "/devices/abc")).toBe(true);
  expect(pageAllowed(app("crm"), "/devices/abc")).toBe(false);
  expect(pageAllowed(app("crm"), "/quotes")).toBe(true);
  expect(pageAllowed(app("psa"), "/tickets/42")).toBe(true);
  expect(pageAllowed(app("docs"), "/knowledge")).toBe(true);
  expect(pageAllowed(app("docs"), "/vault")).toBe(true);
  expect(pageAllowed(app("grc"), "/governance/policies/1")).toBe(true);
  expect(pageAllowed(app("m365"), "/m365/abc")).toBe(true);
  expect(pageAllowed(app("vuln"), "/vulnerabilities")).toBe(true);
  expect(pageAllowed(app("mobile"), "/vulnerabilities")).toBe(false);
});

test("every menu page belongs to some app", () => {
  for (const p of paths) expect(Object.keys(APPS).some((k) => pageAllowed(app(k), p)) || PAGE_FEATURES[p.slice(1)]?.includes("complete")).toBe(true);
});
