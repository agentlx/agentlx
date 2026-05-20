import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DeploymentLockScreen } from "@/components/DeploymentLockScreen";
import { PageLoading } from "@/components/PageLoading";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-provider";
import { APP_DESCRIPTION, APP_NAME, BRAND_MARK_URL } from "@/lib/brand";
import { browserDeploymentFallback, type DeploymentSecurityState } from "@/lib/deployment";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "description", content: APP_DESCRIPTION },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: APP_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "icon", href: BRAND_MARK_URL, type: "image/png" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  pendingComponent: () => <PageLoading />,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentSecurityState>(() =>
    browserDeploymentFallback(),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDeploymentStatus() {
      try {
        const response = await fetch("/api/deployment-status", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          return;
        }
        const nextStatus = (await response.json()) as DeploymentSecurityState;
        if (!cancelled) {
          setDeploymentStatus(nextStatus);
        }
      } catch {
        if (!cancelled) {
          setDeploymentStatus(browserDeploymentFallback());
        }
      }
    }

    void loadDeploymentStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {deploymentStatus.locked ? (
        <>
          <DeploymentLockScreen status={deploymentStatus} />
          <Toaster />
        </>
      ) : (
        <AuthProvider viewer={null}>
          <Outlet />
          <Toaster />
        </AuthProvider>
      )}
    </QueryClientProvider>
  );
}
