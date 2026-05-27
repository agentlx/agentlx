import type { AuthViewer } from "@/lib/auth";
import type { SecurityPrincipal } from "@/lib/security-monitoring";
import { jsonResponse } from "./http.server";
import { hasSecurityMonitoringFeature } from "./edition.server";

export function securityMonitoringUnavailableResponse() {
  return jsonResponse(
    {
      error: "feature_not_available",
      feature: "security_monitoring",
      message: "Security Monitoring is not available in this edition or license.",
    },
    { status: 403 },
  );
}

export async function securityMonitoringFeatureGate() {
  return (await hasSecurityMonitoringFeature()) ? null : securityMonitoringUnavailableResponse();
}

export function toSecurityPrincipal(viewer: Pick<AuthViewer, "id" | "role">): SecurityPrincipal {
  return {
    userId: viewer.id,
    role: viewer.role,
  };
}
