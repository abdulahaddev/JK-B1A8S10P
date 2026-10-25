// Firmware versions on the OTA site, read from its file index through the /ota-site proxy (vite.config.ts).
// The hosting has bot protection, so the site is read as rarely as possible: the list is kept in
// localStorage, fetched only on the first unlock when nothing is stored, and otherwise only by Sync.
import { useSyncExternalStore } from "react";

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
const STORE_KEY = "ota-releases";
const MIN_GAP_MS = 60_000; // at most one site request per minute, even with repeated Sync clicks

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

function stored(): Pick<ReleasesState, "list" | "syncedAt"> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (v && Array.isArray(v.list) && v.list.length) return { list: v.list, syncedAt: v.syncedAt ?? null };
  } catch {
    /* unreadable or blocked storage: treat as empty */
  }
  return { list: null, syncedAt: null };
}

let state: ReleasesState = { ...stored(), error: null, loading: false };
let lastRequest = 0;
const subs = new Set<() => void>();
const set = (s: Partial<ReleasesState>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

/** Reads the OTA site and replaces the stored list. Used by the Sync button. */
export async function syncReleases() {
  if (state.loading) return;
  const wait = lastRequest + MIN_GAP_MS - Date.now();
  if (wait > 0) {
    set({ error: `Synced a moment ago; try again in ${Math.ceil(wait / 1000)} s.` });
    return;
  }
  lastRequest = Date.now();
  set({ loading: true, error: null });
  try {
    const res = await fetch("/ota-site/", { cache: "no-store" });
    if (res.status === 404) throw new Error("OTA site proxy not available. Run the dashboard with npm run dev (or npm run preview).");
    if (res.status === 401 || res.status === 403) throw new Error(`OTA site refused the request (HTTP ${res.status}).`);
    if (!res.ok) throw new Error(`OTA site answered HTTP ${res.status}.`);
    const list = parse(await res.text());
    if (!list.length) throw new Error("No firmware files found on the OTA site (or it returned a bot-check page).");
    const syncedAt = Date.now();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ list, syncedAt }));
    } catch {
      /* storage full or blocked: keep it for this visit only */
    }
    set({ list, syncedAt, loading: false });
  } catch (e) {
    set({ loading: false, error: e instanceof TypeError ? "Could not reach the OTA site (network error)." : (e as Error).message });
  }
}

/** After a successful unlock: fetch only when nothing is stored yet. */
export function ensureReleases() {
  if (!state.list) void syncReleases();
}

export function useReleases(): ReleasesState {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state,
  );
}
