// The home dashboard of a single app (RMM, CRM, PSA, ...): its headline numbers and a way into each of its pages.
// The complete platform and the Antivirus app use the security overview (Overview.tsx) instead.
import { Link } from "react-router-dom";
import { useApp } from "../app-context";
import { useAppInfo } from "../appinfo";
import { PageHead, Stat, useData, useListData } from "../components/ui";

type Shortcut = { to: string; label: string; icon: string; group: string };

// A tile that counts the rows of a list, optionally only those matching `where`.
function CountTile({ label, path, query = {}, where, to, hint, warnAbove }: {
  label: string; path: string; query?: Record<string, unknown>; where?: (row: any) => boolean; to: string; hint?: string; warnAbove?: number;
}) {
  const { tenantId } = useApp();
  const { data, error } = useListData<any>(path, { tenant_id: tenantId || undefined, ...query }, [tenantId]);
  const value = error ? "–" : data ? (where ? data.filter(where).length : data.length) : "…";
  const accent = typeof value === "number" && warnAbove !== undefined ? (value > warnAbove ? "amber" : "green") : undefined;
  return <Stat label={label} value={value} to={to} hint={error ? "not available" : hint} accent={accent} />;
}

function RmmTiles() {
  const { tenantId } = useApp();
  const { data } = useData<any>("rmm/overview", { tenant_id: tenantId || undefined }, [tenantId]);
  const v = (x: number | undefined) => (data ? x ?? 0 : "…");
  return <>
    <Stat label="Devices" value={v(data?.devices)} to="/devices" hint={data ? `${data.online} online · ${data.offline} offline` : undefined} />
    <Stat label="Monitors triggered" value={v(data?.monitorsTriggered)} to="/monitoring" accent={data?.monitorsTriggered ? "amber" : "green"} />
    <Stat label="Patch compliance" value={data ? `${data.patching?.compliancePercent ?? 0}%` : "…"} to="/patching"
          hint={data ? `${data.patching?.missingCriticalOrSecurity ?? 0} missing critical or security updates` : undefined} />
    <Stat label="Jobs running" value={v(data?.jobsRunning)} to="/automation" hint={data ? `${data.remoteSessions} remote sessions open` : undefined} />
  </>;
}

const OPEN_TICKET = (t: any) => !["Resolved", "Closed"].includes(t.status);

function Tiles({ app }: { app: string }) {
  switch (app) {
    case "rmm":
      return <RmmTiles />;
    case "vuln":
      return <>
        <CountTile label="Open vulnerabilities" path="vulnerabilities" to="/vulnerabilities" hint="distinct CVEs across your devices" />
        <CountTile label="Known exploited" path="vulnerabilities" where={(v) => v.knownExploited} to="/vulnerabilities" warnAbove={0} hint="on the CISA KEV list" />
        <CountTile label="Critical" path="vulnerabilities" query={{ severity: "critical" }} to="/vulnerabilities" warnAbove={0} />
        <CountTile label="Devices" path="devices" to="/devices" />
      </>;
    case "crm":
      return <>
        <CountTile label="Accounts" path="crm/accounts" to="/crm" />
        <CountTile label="Quotes" path="psa/quotes" to="/quotes" />
        <CountTile label="Open quotes" path="psa/quotes" where={(q) => ["Draft", "Sent"].includes(q.status)} to="/quotes" />
        <CountTile label="Products" path="psa/products" to="/quotes" />
      </>;
    case "psa":
      return <>
        <CountTile label="Open tickets" path="tickets" where={OPEN_TICKET} to="/service-board" />
        <CountTile label="Unassigned" path="tickets" where={(t) => OPEN_TICKET(t) && !t.assignee} to="/service-board" warnAbove={0} />
        <CountTile label="Companies" path="psa/companies" to="/companies" />
        <CountTile label="Knowledge articles" path="psa/kb" to="/knowledge" />
      </>;
    case "grc":
      return <>
        <CountTile label="Programmes" path="grc/programmes" to="/governance" />
        <CountTile label="Policies" path="grc/policies" to="/governance" />
        <CountTile label="Evidence items" path="grc/evidence" to="/governance" />
        <CountTile label="Risks and records" path="grc/records" to="/governance" />
      </>;
    case "m365":
      return <>
        <CountTile label="Connected tenants" path="m365/connections" to="/m365" />
        <CountTile label="Report schedules" path="m365/report-schedules" to="/m365" />
      </>;
    case "mobile":
      return <>
        <CountTile label="Android phones" path="devices" query={{ platform: "android" }} to="/devices" />
        <CountTile label="Online now" path="devices" query={{ platform: "android", status: "online" }} to="/devices" />
        <CountTile label="iPhones and iPads (web protection)" path="devices" query={{ platform: "ios" }} to="/devices" />
      </>;
    case "docs":
      return <>
        <CountTile label="Articles" path="psa/kb" to="/knowledge" />
        <CountTile label="Credentials in the vault" path="vault/credentials" to="/vault" />
      </>;
    default:
      return null;
  }
}

export default function AppHome({ pages }: { pages: Shortcut[] }) {
  const info = useAppInfo();
  const { tenantId, tenantName } = useApp();
  const shortcuts = pages.filter((p) => p.to !== "/");
  return (
    <>
      <PageHead title={info.title} subtitle={<>{info.summary} <span className="muted">Viewing {tenantId ? tenantName(tenantId) : "all customers"}.</span></>} />
      <div className="grid k4"><Tiles app={info.key} /></div>
      <h2 style={{ margin: "22px 0 10px" }}>Go to</h2>
      <div className="grid k3">
        {shortcuts.map((p) => (
          <Link key={p.to} to={p.to} className="card stat-link" style={{ textDecoration: "none" }}>
            <div className="row" style={{ gap: 10 }}><span aria-hidden style={{ fontSize: 20, width: 24, textAlign: "center" }}>{p.icon}</span>
              <div><b>{p.label}</b><div className="small muted">{p.group}</div></div></div>
          </Link>
        ))}
      </div>
    </>
  );
}
