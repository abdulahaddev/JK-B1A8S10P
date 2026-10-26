import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { allowedBase } from "./src/otaHost";

/** OTA login and default host: OTA_* in .env, else the board's ../secrets.yaml. Never sent to the browser. */
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
    url: env.OTA_BASE_URL || secrets.ota_base_url || "",
    user: env.OTA_USERNAME || secrets.ota_username || "",
    password: env.OTA_PASSWORD || secrets.ota_password || "",
  };
}

/**
 * /ota-site/<host>[/<path>]/ -> https://<host>[/<path>]/ with the OTA login added, for the firmware list.
 * Only hosts under the allowed domains (the firmware's rule). The sites send no CORS headers, so the
 * browser reads them through the dev or preview server. /ota-site-config returns the default base URL.
 */
function otaProxy(mode: string): Plugin {
  const ota = otaSite(mode);
  const auth = ota.user ? "Basic " + Buffer.from(`${ota.user}:${ota.password}`).toString("base64") : "";
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (url === "/ota-site-config") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ base: allowedBase(ota.url) }));
      return;
    }
    if (!url.startsWith("/ota-site/")) return next();
    const rest = url.slice("/ota-site/".length);
    const slash = rest.lastIndexOf("/");
    const base = allowedBase("https://" + (slash >= 0 ? rest.slice(0, slash) : rest));
    const file = slash >= 0 ? rest.slice(slash + 1) : "";
    if (!base || req.method !== "GET" || !/^[A-Za-z0-9._-]*$/.test(file)) {
      res.statusCode = 403;
      res.end("host not allowed");
      return;
    }
    try {
      const r = await fetch(`${base}/${file}`, { headers: auth ? { Authorization: auth } : {}, redirect: "follow" });
      res.statusCode = r.status;
      res.setHeader("Content-Type", r.headers.get("content-type") ?? "text/plain");
      res.setHeader("Cache-Control", "no-store");
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.statusCode = 502;
      res.end(`OTA site not reachable: ${(e as Error).message}`);
    }
  };
  return {
    name: "ota-site-proxy",
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), otaProxy(mode)],
  server: { port: 5173 },
}));
