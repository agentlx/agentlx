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

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@agentlx/enterprise": enterpriseAlias(mode),
    },
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
