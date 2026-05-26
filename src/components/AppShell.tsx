import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  ShieldCheck,
  ScrollText,
  UserCircle2,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BrandLockup } from "@/components/Brand";
import {
  canAccessScreen,
  initialsFromName,
  resolveDefaultAuthenticatedPath,
  type AuthViewer,
} from "@/lib/auth";
import { logoutAction } from "@/lib/auth-api";
import { useAuthState } from "@/lib/auth-client";
import { getEditionStatusAction } from "@/lib/edition-api";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true, screen: "dashboard" },
  { to: "/machines", label: "Maquinas", icon: Monitor, exact: false, screen: "machines" },
  { to: "/groups", label: "Grupos", icon: UsersRound, exact: false, screen: "groups" },
  { to: "/templates", label: "Templates", icon: FileText, exact: false, screen: "templates" },
  {
    to: "/policies",
    label: "Politicas",
    icon: ShieldCheck,
    exact: false,
    screen: "policies",
    feature: "machine_policy",
  },
  { to: "/logs", label: "Logs", icon: ScrollText, exact: false, screen: "logs" },
  { to: "/users", label: "Usuarios", icon: UserCircle2, exact: false, screen: "users" },
] as const;

export function AppShell({
  children,
  breadcrumb,
}: {
  children: ReactNode;
  breadcrumb?: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const logout = useServerFn(logoutAction);
  const getEditionStatus = useServerFn(getEditionStatusAction);
  const { viewer, loading: viewerLoading, refreshViewer } = useAuthState();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (!viewer) {
      setEnabledFeatures(new Set());
      return () => {
        cancelled = true;
      };
    }

    void getEditionStatus()
      .then((status) => {
        if (cancelled) {
          return;
        }
        setEnabledFeatures(
          new Set(
            status.featureCatalog.filter((feature) => feature.enabled).map((feature) => feature.id),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEnabledFeatures(new Set());
        }
      });

    return () => {
      cancelled = true;
    };
  }, [getEditionStatus, viewer]);

  const visibleNav = nav.filter(
    (item) =>
      canAccessScreen(viewer, item.screen) &&
      (!("feature" in item) || enabledFeatures.has(item.feature)),
  );

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      await refreshViewer();
      await router.invalidate();
      await navigate({ to: "/login" });
    } finally {
      setLoggingOut(false);
      setMobileNavOpen(false);
    }
  };

  const renderNav = (mobile = false) => (
    <nav className={`flex-1 ${mobile ? "p-4" : "p-3"} space-y-0.5`}>
      <div className="mb-3 mt-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        System Control
      </div>
      {viewerLoading && visibleNav.length === 0 && (
        <div className="space-y-2 px-3 py-2">
          <div className="h-8 animate-pulse rounded-md bg-secondary" />
          <div className="h-8 animate-pulse rounded-md bg-secondary/70" />
          <div className="h-8 animate-pulse rounded-md bg-secondary/50" />
        </div>
      )}
      {visibleNav.map((item) => {
        const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setMobileNavOpen(false)}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
              active
                ? "border-primary/20 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
            }`}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
      {viewer && (
        <Link
          to="/license"
          onClick={() => setMobileNavOpen(false)}
          className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
            pathname.startsWith("/license")
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground"
          }`}
        >
          <KeyRound className="size-4" />
          <span>Licenca</span>
        </Link>
      )}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-border p-4">
      <div className="flex items-center gap-3 px-2">
        <ViewerProfilePhoto viewer={viewer} />
        <div className="min-w-0 overflow-hidden">
          <p className="truncate text-xs font-medium">{viewer?.fullName ?? "Usuario"}</p>
          <p className="truncate text-[10px] text-muted-foreground">{viewer?.email ?? ""}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link
          to="/profile"
          onClick={() => setMobileNavOpen(false)}
          className="flex items-center justify-center gap-1.5 rounded border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary"
        >
          <UserCircle2 className="size-3.5" /> Perfil
        </Link>
        <button
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="flex items-center justify-center gap-1.5 rounded border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary disabled:opacity-60"
        >
          <LogOut className="size-3.5" /> {loggingOut ? "Saindo..." : "Sair"}
        </button>
      </div>
      {viewer && visibleNav.length === 0 && (
        <Link
          to={resolveDefaultAuthenticatedPath(viewer)}
          onClick={() => setMobileNavOpen(false)}
          className="block rounded border border-primary/20 bg-primary/10 px-3 py-2 text-center text-[11px] text-primary transition-colors hover:bg-primary/15"
        >
          Ir para a sua area
        </Link>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/30">
      <aside className="sticky top-0 z-20 hidden h-screen w-60 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="border-b border-border p-5">
          <Link to="/" className="flex items-center gap-2.5 font-mono font-bold tracking-tight">
            <BrandLockup />
          </Link>
        </div>
        {renderNav()}
        {footer}
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-background/75 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative h-full w-[min(86vw,320px)] border-r border-border bg-sidebar shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-5">
              <Link
                to="/"
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-2.5 font-mono font-bold tracking-tight"
              >
                <BrandLockup />
              </Link>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="rounded border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {renderNav(true)}
            {footer}
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm font-mono text-muted-foreground">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="grid size-9 shrink-0 place-items-center rounded border border-border bg-surface text-foreground transition-colors hover:bg-secondary lg:hidden"
            >
              <Menu className="size-4" />
            </button>
            {breadcrumb ?? <span>root / dashboard</span>}
          </div>
        </header>
        <div className="flex-1 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}

function ViewerProfilePhoto({
  viewer,
}: {
  viewer: Pick<AuthViewer, "fullName" | "profilePhotoUrl"> | null | undefined;
}) {
  if (viewer?.profilePhotoUrl) {
    return (
      <img
        src={viewer.profilePhotoUrl}
        alt=""
        className="size-8 shrink-0 rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <div className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-secondary text-xs font-mono">
      {initialsFromName(viewer?.fullName ?? "Usuario")}
    </div>
  );
}

export function StatusDot({ status }: { status: "online" | "offline" | "warning" }) {
  const map = {
    online: "bg-success animate-pulse-dot glow-success",
    offline: "bg-offline",
    warning: "bg-warning animate-pulse-dot",
  } as const;
  return <span className={`inline-block size-2 rounded-full ${map[status]}`} />;
}

export function StatusLabel({ status }: { status: "online" | "offline" | "warning" }) {
  const map = {
    online: { text: "UP", cls: "text-success" },
    offline: { text: "DOWN", cls: "text-offline" },
    warning: { text: "WARN", cls: "text-warning" },
  } as const;
  return (
    <span className={`font-mono text-xs font-bold ${map[status].cls}`}>{map[status].text}</span>
  );
}

export function Crumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm font-mono text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex min-w-0 items-center gap-2">
          {i > 0 && <span className="text-border">/</span>}
          {it.to ? (
            <Link to={it.to} className="truncate transition-colors hover:text-foreground">
              {it.label}
            </Link>
          ) : (
            <span className="truncate text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
