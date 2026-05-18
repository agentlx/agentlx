import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowUpRight, CheckCircle2, Cpu, Server, ServerCrash } from "lucide-react";
import { AppShell, Crumb, StatusDot, StatusLabel } from "@/components/AppShell";
import { APP_NAME } from "@/lib/brand";
import { getDashboardData } from "@/lib/panel-api";
import { requireRouteScreen } from "@/lib/route-protection";

export const Route = createFileRoute("/")({
  loader: async () => {
    await requireRouteScreen("dashboard");
    return getDashboardData();
  },
  head: () => ({
    meta: [
      { title: APP_NAME },
      {
        name: "description",
        content: "Visao geral da frota de servidores Linux gerenciados pelo agentlx.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const data = Route.useLoaderData();

  return (
    <AppShell breadcrumb={<Crumb items={[{ label: "root", to: "/" }, { label: "dashboard" }]} />}>
      <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:space-y-8 lg:px-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visao geral da frota</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Status agregado de todas as maquinas Linux conectadas ao agentlx.
          </p>
        </div>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Server} label="Total de maquinas" value={data.total} hint="registradas" />
          <KpiCard
            icon={CheckCircle2}
            label="Online"
            value={data.online}
            hint={data.total > 0 ? `${((data.online / data.total) * 100).toFixed(1)}%` : "0%"}
            tone="success"
          />
          <KpiCard
            icon={ServerCrash}
            label="Offline"
            value={data.offline}
            hint="sem resposta"
            tone="muted"
          />
          <KpiCard
            icon={Activity}
            label="Em alerta"
            value={data.warning}
            hint="degradadas"
            tone="warning"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-stretch">
          <div className="overflow-hidden rounded-lg border border-border bg-surface lg:col-span-2">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Maquinas conectadas</h2>
              <Link
                to="/machines"
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver todas <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] table-fixed text-left text-xs">
                <tbody className="divide-y divide-border">
                  {data.machines.map((machine) => (
                    <tr key={machine.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="w-28 px-5 py-3">
                        <Link
                          to="/machines/$machineId"
                          params={{ machineId: machine.id }}
                          className="flex items-center gap-2"
                        >
                          <StatusDot status={machine.status} />
                          <span className="capitalize text-muted-foreground">{machine.status}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          to="/machines/$machineId"
                          params={{ machineId: machine.id }}
                          className="block truncate text-sm font-medium hover:text-primary"
                        >
                          {machine.hostname}
                        </Link>
                      </td>
                      <td className="w-36 px-3 py-3">
                        <Link
                          to="/machines/$machineId"
                          params={{ machineId: machine.id }}
                          className="block truncate font-mono text-[11px] text-muted-foreground hover:text-primary"
                        >
                          {machine.agentName}
                        </Link>
                      </td>
                      <td className="w-36 truncate px-3 py-3 font-mono text-[11px] text-muted-foreground">
                        {machine.ip}
                      </td>
                      <td className="w-40 truncate px-3 py-3 text-muted-foreground">
                        {machine.os}
                      </td>
                      <td className="w-28 px-5 py-3 text-right font-mono text-[11px] text-muted-foreground">
                        {machine.lastSeen}
                      </td>
                    </tr>
                  ))}
                  {data.machines.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-8 text-center text-sm text-muted-foreground"
                      >
                        Nenhuma maquina conectada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {data.machines.map((machine) => (
                <li key={machine.id}>
                  <Link
                    to="/machines/$machineId"
                    params={{ machineId: machine.id }}
                    className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:gap-4"
                  >
                    <StatusDot status={machine.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{machine.hostname}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        Agent: {machine.agentName}
                      </p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {machine.ip} · {machine.os}
                      </p>
                    </div>
                    <span className="w-full font-mono text-[11px] text-muted-foreground sm:w-16 sm:text-right">
                      {machine.lastSeen}
                    </span>
                  </Link>
                </li>
              ))}
              {data.machines.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma maquina conectada.
                </li>
              )}
            </ul>
          </div>

          <div className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-border bg-surface lg:col-start-3 lg:row-span-2 lg:row-start-1">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Execucoes recentes</h2>
              <Link to="/logs" className="text-xs font-medium text-primary hover:underline">
                Logs
              </Link>
            </div>
            <ul className="flex-1 divide-y divide-border overflow-hidden">
              {data.recentExecutions.map((execution) => (
                <li key={execution.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-xs font-medium">
                      {execution.templateName}
                    </p>
                    <StatusLabel
                      status={
                        execution.status === "success"
                          ? "online"
                          : execution.status === "failed"
                            ? "offline"
                            : "warning"
                      }
                    />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {execution.machineHostname} · {execution.executedAt.split(" ")[1]}
                  </p>
                </li>
              ))}
              {data.recentExecutions.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma execucao recente.
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Cpu className="size-3" /> CPU media
            </div>
            <p className="mt-2 font-mono text-3xl font-bold">{data.avgCpu}%</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary" style={{ width: `${data.avgCpu}%` }} />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              RAM agregada
            </div>
            <p className="mt-2 text-3xl font-bold font-mono">
              {data.ramUsedTotal.toFixed(1)}
              <span className="text-base text-muted-foreground"> / {data.ramTotal} GB</span>
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof Server;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "muted";
}) {
  const toneCls = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    muted: "text-offline",
  }[tone];

  return (
    <div className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/40">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-2">
        <span className={`font-mono text-3xl font-bold tabular-nums ${toneCls}`}>{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function ServiceTag({ name }: { name: string }) {
  const toneKey = name.toLowerCase();
  const map: Record<string, string> = {
    carbonio: "border-primary/20 bg-primary/10 text-primary",
    postfix: "border-border bg-secondary text-muted-foreground",
    nginx: "border-border bg-secondary text-muted-foreground",
    mariadb: "border-success/20 bg-success/10 text-success",
    redis: "border-destructive/20 bg-destructive/10 text-destructive",
    restic: "border-border bg-secondary text-muted-foreground",
  };

  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
        map[toneKey] ?? "border-border bg-secondary text-muted-foreground"
      }`}
    >
      {name}
    </span>
  );
}
