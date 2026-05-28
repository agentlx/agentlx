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
  const dashboard = read("src/routes/monitoring.tsx");
  const detail = read("src/routes/monitoring.events_.$eventId.tsx");

  assert.match(api, /export const updateSecurityAlertStatusData/);
  assert.match(api, /export const createSecurityAlertCommentData/);
  assert.match(api, /export const listSecurityRulesData/);
  assert.match(api, /viewer\.role !== "admin"/);
  assert.match(dashboard, /viewer\.role === "admin"/);
  assert.match(dashboard, /Regras de monitoramento/);
  assert.match(detail, /Gestao do alerta/);
  assert.match(detail, /Adicionar anotacao/);
});

test("monitoring dashboard loads admin rules without serial request waterfall", () => {
  const dashboard = read("src/routes/monitoring.tsx");

  assert.match(dashboard, /const \[dashboard, rules\] = await Promise\.all\(/);
  assert.match(dashboard, /viewer\.role === "admin"/);
});

test("events view offers csv and json exports", () => {
  const events = read("src/routes/monitoring.events.tsx");

  assert.match(events, /exportCurrent\("csv"\)/);
  assert.match(events, /exportCurrent\("json"\)/);
});
