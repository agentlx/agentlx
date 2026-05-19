import { redirect } from "@tanstack/react-router";
import type { AuthViewer, ScreenPermission } from "@/lib/auth";
import { canAccessScreen, resolveDefaultAuthenticatedPath } from "@/lib/auth";
import { getCurrentViewerAction } from "@/lib/auth-api";
import { getDeploymentStatusAction } from "@/lib/deployment-api";

async function redirectIfDeploymentLocked() {
  const deploymentStatus = await getDeploymentStatusAction();
  if (deploymentStatus.locked) {
    throw redirect({ to: "/login" });
  }
}

export async function requireRouteViewer() {
  await redirectIfDeploymentLocked();
  const viewer = await getCurrentViewerAction();
  if (!viewer) {
    throw redirect({ to: "/login" });
  }
  return viewer;
}

export async function requireRouteScreen(screen: ScreenPermission): Promise<AuthViewer> {
  const viewer = await requireRouteViewer();
  if (!canAccessScreen(viewer, screen)) {
    throw redirect({ to: resolveDefaultAuthenticatedPath(viewer) });
  }
  return viewer;
}

export async function redirectIfAuthenticated() {
  await redirectIfDeploymentLocked();
  const viewer = await getCurrentViewerAction();
  if (viewer) {
    throw redirect({ to: resolveDefaultAuthenticatedPath(viewer) });
  }
  return null;
}

export async function requireAdminRoute() {
  const viewer = await requireRouteViewer();
  if (viewer.role !== "admin") {
    throw redirect({ to: resolveDefaultAuthenticatedPath(viewer) });
  }
  return viewer;
}
