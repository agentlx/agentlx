import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function enterpriseAlias(mode: string) {
  const edition = process.env.AGENTLX_EDITION;
  if (mode !== "enterprise" && edition !== "enterprise") {
    return resolve(__dirname, "src/enterprise/community.ts");
  }

  const dockerEnterpriseEntry = resolve(__dirname, "enterprise/src/index.ts");
  if (existsSync(dockerEnterpriseEntry)) {
    return dockerEnterpriseEntry;
  }

  return resolve(__dirname, "../agentlx-enterprise/src/index.ts");
}

function enterpriseUiAlias(mode: string) {
  const edition = process.env.AGENTLX_EDITION;
  if (mode !== "enterprise" && edition !== "enterprise") {
    return resolve(__dirname, "src/enterprise/community-ui.tsx");
  }

  const dockerEnterpriseUi = resolve(__dirname, "enterprise/src/ui/monitoring/index.tsx");
  if (existsSync(dockerEnterpriseUi)) {
    return dockerEnterpriseUi;
  }

  return resolve(__dirname, "../agentlx-enterprise/src/ui/monitoring/index.tsx");
}

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "src") },
      { find: /^@agentlx\/enterprise$/, replacement: enterpriseAlias(mode) },
      { find: /^@agentlx\/enterprise-ui$/, replacement: enterpriseUiAlias(mode) },
      {
        find: /^@tanstack\/react-router$/,
        replacement: resolve(__dirname, "node_modules/@tanstack/react-router"),
      },
      {
        find: /^@tanstack\/react-start$/,
        replacement: resolve(__dirname, "node_modules/@tanstack/react-start"),
      },
      { find: /^lucide-react$/, replacement: resolve(__dirname, "node_modules/lucide-react") },
      { find: /^react$/, replacement: resolve(__dirname, "node_modules/react") },
      { find: /^react-dom$/, replacement: resolve(__dirname, "node_modules/react-dom") },
      { find: /^recharts$/, replacement: resolve(__dirname, "node_modules/recharts") },
    ],
  },
  plugins: [
    tanstackStart({
      server: { entry: "./src/server.ts" },
    }),
    viteReact(),
    tsconfigPaths(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@xterm/")) {
            return "terminal-runtime";
          }
          return undefined;
        },
      },
    },
  },
}));
