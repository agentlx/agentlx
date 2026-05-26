import { getEnterpriseProvider } from "@/enterprise";

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getBuildInfo() {
  const edition = getEnterpriseProvider().edition;
  const version = envValue("AGENTLX_VERSION") ?? envValue("npm_package_version") ?? "0.0.0";
  const revision = envValue("AGENTLX_BUILD_REVISION");
  const source = envValue("AGENTLX_BUILD_SOURCE") ?? "local";
  const imageRef = envValue("AGENTLX_IMAGE_REF") ?? envValue("AGENTLX_ENTERPRISE_IMAGE") ?? null;
  const imageDigest = envValue("AGENTLX_IMAGE_DIGEST");
  const officialBuild = /^true$/i.test(envValue("AGENTLX_OFFICIAL_BUILD") ?? "");

  return {
    edition,
    version,
    revision,
    source,
    imageRef,
    imageDigest,
    officialBuild,
    verifiedOfficialBuild: Boolean(
      officialBuild &&
      revision &&
      source === "github-actions" &&
      imageRef?.startsWith("ghcr.io/agentlx/agentlx:"),
    ),
  };
}
