import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("monitoring parent renders child routes through Outlet", () => {
  const source = read("src/routes/monitoring.tsx");

  assert.match(source, /import \{[^}]*Outlet[^}]*useRouterState[^}]*\}/);
  assert.match(source, /if \(pathname !== "\/monitoring"\) \{\s*return <Outlet \/>;/);
});

test("security monitoring exposes alert actions and admin-only rule actions", () => {
  const api = read("src/lib/security-monitoring-api.ts");
  const rules = read("src/routes/monitoring.rules.tsx");
  const alerts = read("src/routes/monitoring.alerts.tsx");
  const detail = read("src/routes/monitoring.events_.$eventId.tsx");

  assert.match(api, /export const updateSecurityAlertStatusData/);
  assert.match(api, /export const createSecurityAlertCommentData/);
  assert.match(api, /export const listSecurityAlertsData/);
  assert.match(api, /export const listSecurityRulesData/);
  assert.match(api, /viewer\.role !== "admin"/);
  assert.match(rules, /viewer\.role !== "admin"/);
  assert.match(rules, /updateSecurityRuleData/);
  assert.match(alerts, /updateSecurityAlertStatusData/);
  assert.match(detail, /Gestao do alerta/);
  assert.match(detail, /Adicionar anotacao/);
});

test("monitoring section uses layered routes", () => {
  const dashboard = read("src/routes/monitoring.tsx");
  const machines = read("src/routes/monitoring.machines.tsx");
  const machineDetail = read("src/routes/monitoring.machines.$machineId.tsx");

  assert.match(dashboard, /Prioridades operacionais/);
  assert.match(dashboard, /to="\/monitoring\/machines"/);
  assert.match(dashboard, /to="\/monitoring\/alerts"/);
  assert.match(machines, /Maquinas monitoradas/);
  assert.match(machineDetail, /Portas\/conexoes/);
  assert.match(machineDetail, /Arquivos\/FIM/);
  assert.match(machineDetail, /Configuracoes/);
});

test("events view offers csv and json exports", () => {
  const events = read("src/routes/monitoring.events.tsx");

  assert.match(events, /exportCurrent\("csv"\)/);
  assert.match(events, /exportCurrent\("json"\)/);
});

test("agent security event contract accepts enterprise fingerprints", () => {
  const contract = read("src/lib/security-monitoring.ts");

  assert.match(contract, /eventFingerprint/);
  assert.match(contract, /\.max\(128\)/);
});
