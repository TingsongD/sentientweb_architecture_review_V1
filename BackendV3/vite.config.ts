import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const host = new URL(appUrl).hostname;

export default defineConfig({
  server: {
    allowedHosts: [host],
    cors: {
      preflightContinue: true
    },
    port: Number(process.env.PORT || 3000),
    host: "0.0.0.0",
    fs: {
      allow: ["app", "node_modules", "public"]
    }
  },
  plugins: [reactRouter(), tsconfigPaths()],
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url))
    },
    extensions: [".ts", ".tsx", ".js", ".jsx", ".server.ts", ".server.tsx"]
  },
  build: {
    assetsInlineLimit: 0
  }
}) satisfies UserConfig;
