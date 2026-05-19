export const DEPLOYMENT_DOCS_URL = "https://doc.agentlx.com.br";

export type DeploymentSecurityState = {
  locked: boolean;
  appOrigin: string;
  detectedOrigin: string;
  docsUrl: string;
  trustedProxy: boolean;
  headers: {
    host: string | null;
    xForwardedProto: string | null;
    xForwardedHost: string | null;
    xForwardedPort: string | null;
    xForwardedSsl: string | null;
  };
  reasons: string[];
};

export function browserDeploymentFallback(): DeploymentSecurityState {
  if (typeof window === "undefined") {
    return {
      locked: false,
      appOrigin: "",
      detectedOrigin: "",
      docsUrl: DEPLOYMENT_DOCS_URL,
      trustedProxy: false,
      headers: {
        host: null,
        xForwardedProto: null,
        xForwardedHost: null,
        xForwardedPort: null,
        xForwardedSsl: null,
      },
      reasons: [],
    };
  }

  const appOrigin = window.location.origin;
  const locked = window.location.protocol !== "https:";

  return {
    locked,
    appOrigin,
    detectedOrigin: appOrigin,
    docsUrl: DEPLOYMENT_DOCS_URL,
    trustedProxy: false,
    headers: {
      host: window.location.host,
      xForwardedProto: null,
      xForwardedHost: null,
      xForwardedPort: null,
      xForwardedSsl: null,
    },
    reasons: locked
      ? ["A pagina foi acessada por HTTP. Configure HTTPS para liberar o painel."]
      : [],
  };
}
