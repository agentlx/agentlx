import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("monitoring parent renders child routes through Outlet", () => {
  const source = read("src/routes/monitoring.tsx");

  assert.match(source, /import \{[^}]*Outlet[^}]*useLocation[^}]*\}/);
  assert.match(source, /if \(pathname !== "\/monitoring"\) \{\s*return <Outlet \/>;/);
});

test("security monitoring keeps delegated contracts and admin-only rule gate", () => {
  const api = read("src/lib/security-monitoring-api.ts");
  const rules = read("src/routes/monitoring.rules.tsx");

  assert.match(api, /export const updateSecurityAlertStatusData/);
  assert.match(api, /export const createSecurityAlertCommentData/);
  assert.match(api, /export const listSecurityAlertsData/);
  assert.match(api, /export const listSecurityRulesData/);
  assert.match(api, /viewer\.role !== "admin"/);
  assert.match(rules, /viewer\.role !== "admin"/);
  assert.match(rules, /hasSecurityMonitoringFeature/);
});

test("monitoring routes delegate enterprise UI without exposing implementation details", () => {
  const dashboard = read("src/routes/monitoring.tsx");
  const machines = read("src/routes/monitoring.machines.tsx");
  const machineDetail = read("src/routes/monitoring.machines.$machineId.tsx");
  const communityUi = read("src/enterprise/community-ui.tsx");

  assert.match(dashboard, /@agentlx\/enterprise-ui/);
  assert.match(machines, /@agentlx\/enterprise-ui/);
  assert.match(machineDetail, /@agentlx\/enterprise-ui/);
  assert.doesNotMatch(machineDetail, /Portas\/conexoes|Arquivos\/FIM|config\.json/);
  assert.match(communityUi, /Security Monitoring esta disponivel no AgentLX Enterprise/);
});

test("events route delegates enterprise event UI", () => {
  const events = read("src/routes/monitoring.events.tsx");

  assert.match(events, /MonitoringEventsPage/);
  assert.doesNotMatch(events, /exportCurrent\("csv"\)|exportCurrent\("json"\)/);
});

test("agent security event contract accepts enterprise fingerprints", () => {
  const contract = read("src/lib/security-monitoring.ts");

  assert.match(contract, /eventFingerprint/);
  assert.match(contract, /\.max\(128\)/);
});
