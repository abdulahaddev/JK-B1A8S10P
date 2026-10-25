import { initializeApp } from "firebase/app";
import {
  endAt,
  get,
  getDatabase,
  limitToLast,
  onValue,
  orderByKey,
  query,
  ref,
  remove,
  set,
  startAt,
} from "firebase/database";
import { useEffect, useRef, useState } from "react";
import type { Boot, Control, Crash, Device, Info, Reading } from "./types";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  databaseURL: import.meta.env.VITE_FIREBASE_DB_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
});
const db = getDatabase(app);

/** A live node: re-renders on every change Firebase pushes. */
export function useNode<T>(path: string): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => onValue(ref(db, path), (s) => setValue(s.val() as T | null)), [path]);
  return value;
}

export const useDevice = () => useNode<Device>("device");
export const useInfo = () => useNode<Info>("info");
export const useControl = () => useNode<Control>("control");

/** Keyed children ("<unix ts>": {...}) as a sorted array with ts. */
function keyed<T>(obj: Record<string, Omit<T, "ts">> | null): (T & { ts: number })[] {
  if (!obj) return [];
  return Object.entries(obj)
    .map(([k, v]) => ({ ...(v as object), ts: Number(k) }) as T & { ts: number })
    .sort((a, b) => a.ts - b.ts);
}

/** Last N children of a keyed node, live. */
export function useLatest<T>(path: string, n: number): (T & { ts: number })[] {
  const [rows, setRows] = useState<(T & { ts: number })[]>([]);
  useEffect(
    () => onValue(query(ref(db, path), orderByKey(), limitToLast(n)), (s) => setRows(keyed<T>(s.val()))),
    [path, n],
  );
  return rows;
}

export const useBoots = () => useLatest<Boot>("boots", 50);
export const useCrashes = () => useLatest<Crash>("crashes", 20);

// Several charts can ask for the same comparison window at once: share one request per window.
const cache = new Map<string, { at: number; rows: Promise<Reading[]> }>();

/** Telemetry between two unix times (inclusive); identical windows within 30 s reuse one request. */
export function fetchReadings(from: number, to: number): Promise<Reading[]> {
  const k = `${from}-${to}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < 30_000) return hit.rows;
  const q = query(ref(db, "telemetry"), orderByKey(), startAt(String(from)), endAt(String(to)));
  const rows = get(q).then((s) => keyed<Reading>(s.val()));
  rows.catch(() => cache.delete(k));
  cache.set(k, { at: Date.now(), rows });
  for (const [key, v] of cache) if (Date.now() - v.at > 300_000) cache.delete(key);
  return rows;
}

/** Hourly cumulative charge counter (energy/<ts> = Ah). */
export async function fetchEnergy(from: number): Promise<{ ts: number; ah: number }[]> {
  const q = query(ref(db, "energy"), orderByKey(), startAt(String(from)));
  const v = (await get(q)).val() as Record<string, number> | null;
  return v ? Object.entries(v).map(([k, ah]) => ({ ts: Number(k), ah })).sort((a, b) => a.ts - b.ts) : [];
}

/**
 * A history window that reloads when its range changes and refreshes in place every `refreshS`.
 * Keeps showing the previous data while a reload is in flight (no flash).
 */
export function useReadings(from: number, to: number, refreshS = 60) {
  const [rows, setRows] = useState<Reading[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const key = useRef("");
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), refreshS * 1000);
    return () => clearInterval(t);
  }, [refreshS]);
  useEffect(() => {
    const k = `${from}-${to}-${tick}`;
    key.current = k;
    setLoading(true);
    fetchReadings(from, to)
      .then((r) => key.current === k && setRows(r))
      .finally(() => key.current === k && setLoading(false));
  }, [from, to, tick]);
  return { rows, loading };
}

/** The same window moved back by `shiftS` (0 = off: nothing is fetched). */
export function useShifted(from: number, to: number, shiftS: number) {
  const [rows, setRows] = useState<Reading[] | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useRef("");
  useEffect(() => {
    const k = `${from}-${to}-${shiftS}`;
    key.current = k;
    if (!shiftS) {
      setRows(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchReadings(from - shiftS, to - shiftS)
      .then((r) => key.current === k && setRows(r))
      .finally(() => key.current === k && setLoading(false));
  }, [from, to, shiftS]);
  return { rows: shiftS ? rows : null, loading };
}

// Remote control (same nodes as tools/control.py)
export const setOta = (version: string) => set(ref(db, "control/ota"), version);
export const clearOta = () => remove(ref(db, "control/ota"));
export const requestRestart = () => set(ref(db, "control/restart"), String(Math.floor(Date.now() / 1000)));
export const clearRestart = () => remove(ref(db, "control/restart"));
