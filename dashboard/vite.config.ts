import { existsSync, readFileSync } from "node:fs";
import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

/** OTA site and its login: OTA_* in .env, else the board's ../secrets.yaml. Never exposed to the browser. */
function otaSite(mode: string) {
  const env = loadEnv(mode, process.cwd(), "OTA_");
  const secrets: Record<string, string> = {};
  if (existsSync("../secrets.yaml")) {
    for (const line of readFileSync("../secrets.yaml", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_]+):\s*"(.*)"/);
      if (m) secrets[m[1]] = m[2];
    }
  }
  return {
    url: env.OTA_BASE_URL || secrets.ota_base_url,
    user: env.OTA_USERNAME || secrets.ota_username,
    password: env.OTA_PASSWORD || secrets.ota_password,
  };
}

export default defineConfig(({ mode }) => {
  const ota = otaSite(mode);
  // The site sends no CORS headers, so the browser reads its file index through this proxy
  const proxy: Record<string, ProxyOptions> = ota.url
    ? {
        "/ota-site": {
          target: ota.url,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/ota-site/, ""),
          headers: ota.user ? { Authorization: `Basic ${Buffer.from(`${ota.user}:${ota.password ?? ""}`).toString("base64")}` } : {},
        },
      }
    : {};
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { proxy },
  };
});
