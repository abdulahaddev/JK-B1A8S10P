// Firmware versions on an OTA host, read from its file index through the /ota-site/<host> dev proxy
// (vite.config.ts). The hosting has bot protection, so a host is read as rarely as possible: each host's
// list is kept in localStorage, fetched only on the first unlock when nothing is stored, otherwise by Sync.
import { useSyncExternalStore } from "react";
import { proxyPath } from "./otaHost";

export interface Release {
  version: string;
  size?: number; // bytes
  uploaded?: number; // unix s
}

export interface ReleasesState {
  list: Release[] | null;
  error: string | null;
  loading: boolean;
  syncedAt: number | null; // unix ms
}

const NAME = /^jk-bms-([0-9A-Za-z._-]+)\.ota\.bin$/;
const STORE_KEY = "ota-releases:"; // + base URL
const MIN_GAP_MS = 60_000; // at most one request per host and minute, even with repeated Sync clicks
const EMPTY: ReleasesState = { list: null, error: null, loading: false, syncedAt: null };

/** Version order: numeric parts compared as numbers (1.2.10 > 1.2.9). */
export const compareVersions = (a: string, b: string) => {
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? "", y = pb[i] ?? "";
    const d = /^\d+$/.test(x) && /^\d+$/.test(y) ? Number(x) - Number(y) : x.localeCompare(y);
    if (d) return d;
  }
  return 0;
};

/** Parses the autoindex page; only versions whose .md5 is also there count (the board needs both). */
function parse(html: string): Release[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const files = new Map<string, HTMLTableRowElement | null>();
  doc.querySelectorAll("a[href]").forEach((a) => {
    const name = decodeURIComponent((a.getAttribute("href") ?? "").split("/").pop() ?? "");
    files.set(name, a.closest("tr"));
  });
  const num = (td?: Element) => {
    const n = Number(td?.getAttribute("data-sort"));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const out: Release[] = [];
  for (const [name, row] of files) {
    const m = name.match(NAME);
    if (!m || !files.has(`${name}.md5`)) continue;
    // Row cells: name, modified (data-sort = unix s), size (data-sort = bytes)
    const td = row ? row.querySelectorAll("td") : undefined;
    out.push({ version: m[1], uploaded: num(td?.[1]), size: num(td?.[2]) });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

function stored(base: string): ReleasesState {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY + base) ?? "null");
    if (v && Array.isArray(v.list) && v.list.length) return { ...EMPTY, list: v.list, syncedAt: v.syncedAt ?? null };
  } catch {
    /* unreadable or blocked storage: treat as empty */
  }
  return EMPTY;
}

const states = new Map<string, ReleasesState>();
const lastRequest = new Map<string, number>();
const subs = new Set<() => void>();
const get = (base: string) => {
  if (!states.has(base)) states.set(base, stored(base));
  return states.get(base)!;
};
const set = (base: string, s: Partial<ReleasesState>) => {
  states.set(base, { ...get(base), ...s });
  subs.forEach((f) => f());
};

/** Reads the host's index and replaces its stored list. Used by the Sync button. */
export async function syncReleases(base: string) {
  if (!base || get(base).loading) return;
  const wait = (lastRequest.get(base) ?? 0) + MIN_GAP_MS - Date.now();
  if (wait > 0) {
    set(base, { error: `Synced a moment ago; try again in ${Math.ceil(wait / 1000)} s.` });
    return;
  }
  lastRequest.set(base, Date.now());
  set(base, { loading: true, error: null });
  try {
    const res = await fetch(`/ota-site/${proxyPath(base)}/`, { cache: "no-store" });
    const text = await res.text();
    // Without the dev/preview server a static host answers with the dashboard itself
    if (text.includes('id="root"')) throw new Error("OTA proxy not available. Run the dashboard with npm run dev (or npm run preview).");
    if (res.status === 502 || text === "host not allowed") throw new Error(text);
    if (res.status === 401 || res.status === 403) throw new Error(`OTA host refused the request (HTTP ${res.status}).`);
    if (!res.ok) throw new Error(`OTA host answered HTTP ${res.status}.`);
    const list = parse(text);
    if (!list.length) throw new Error("No firmware files found on this host (or it returned a bot-check page).");
    const syncedAt = Date.now();
    try {
      localStorage.setItem(STORE_KEY + base, JSON.stringify({ list, syncedAt }));
    } catch {
      /* storage full or blocked: keep it for this visit only */
    }
    set(base, { list, syncedAt, loading: false });
  } catch (e) {
    set(base, { loading: false, error: e instanceof TypeError ? "Could not reach the dashboard's OTA proxy (network error)." : (e as Error).message });
  }
}

/** After a successful unlock: fetch only when nothing is stored for this host yet. */
export function ensureReleases(base: string) {
  if (base && !get(base).list) void syncReleases(base);
}

export function useReleases(base: string): ReleasesState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => (base ? get(base) : EMPTY),
  );
}

/** Default OTA base URL from the dev server (ota_base_url in secrets.yaml), "" when not available. */
let defaultBase: Promise<string> | null = null;
export function loadDefaultBase(): Promise<string> {
  defaultBase ??= fetch("/ota-site-config")
    .then((r) => (r.ok ? r.json() : { base: "" }))
    .then((j: { base?: string }) => j.base ?? "")
    .catch(() => "");
  return defaultBase;
}
