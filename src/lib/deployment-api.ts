import { createServerFn } from "@tanstack/react-start";
import type { DeploymentSecurityState } from "@/lib/deployment";

export const getDeploymentStatusAction = createServerFn({ method: "GET" }).handler(
  async (): Promise<DeploymentSecurityState> => {
    const { getDeploymentSecurityState } = await import("@/server/env.server");
    return getDeploymentSecurityState();
  },
);
