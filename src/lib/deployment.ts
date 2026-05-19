export const DEPLOYMENT_DOCS_URL = "https://doc.agentlx.com.br";

export type DeploymentSecurityState = {
  locked: boolean;
  appOrigin: string;
  docsUrl: string;
  reasons: string[];
};

export function browserDeploymentFallback(): DeploymentSecurityState {
  if (typeof window === "undefined") {
    return {
      locked: false,
      appOrigin: "",
      docsUrl: DEPLOYMENT_DOCS_URL,
      reasons: [],
    };
  }

  const appOrigin = window.location.origin;
  const locked = window.location.protocol !== "https:";

  return {
    locked,
    appOrigin,
    docsUrl: DEPLOYMENT_DOCS_URL,
    reasons: locked
      ? ["A pagina foi acessada por HTTP. Configure HTTPS para liberar o painel."]
      : [],
  };
}
