import type { LucideIcon } from "lucide-react";
import { SlidersHorizontal, BarChart3, BatteryCharging, Cpu, LayoutDashboard, Moon, Sun, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { todayStart } from "./analytics";
import { Analytics } from "./components/Analytics";
import { DevicePage } from "./components/Device";
import { Energy } from "./components/Energy";
import { Overview } from "./components/Overview";
import { RemoteControl } from "./components/RemoteControl";
import { Ago, Segmented, StatusPill } from "./components/ui";
import { useControlWatcher } from "./controlLog";
import { useControl, useDevice, useInfo, useLatest, useReadings } from "./data";
import { useTheme, type Tokens } from "./theme";
import type { Reading } from "./types";

const PAGES = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, sub: "Live state of the pack" },
  { id: "analytics", label: "Analytics", icon: BarChart3, sub: "History, trends and comparisons" },
  { id: "energy", label: "Energy", icon: BatteryCharging, sub: "Daily energy and usage patterns" },
  { id: "device", label: "Device", icon: Cpu, sub: "Board health and remote control" },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon; sub: string }[];
type PageId = (typeof PAGES)[number]["id"];

const RANGES = [
  { id: "1h", label: "1H", name: "Last hour", s: 3600, refresh: 60 },
  { id: "6h", label: "6H", name: "Last 6 hours", s: 6 * 3600, refresh: 60 },
  { id: "24h", label: "24H", name: "Last 24 hours", s: 86400, refresh: 120 },
  { id: "7d", label: "7D", name: "Last 7 days", s: 7 * 86400, refresh: 600 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

/** Wall clock in whole seconds, refreshed every `everyS` (keeps history queries stable in between). */
function useNow(everyS: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), everyS * 1000);
    return () => clearInterval(t);
  }, [everyS]);
  return now;
}

function remembered<T extends string>(key: string, ok: readonly { id: T }[], fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return ok.some((o) => o.id === v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* not essential */
  }
}

const pageFromHash = (): PageId => {
  const h = window.location.hash.replace("#", "");
  return PAGES.some((p) => p.id === h) ? (h as PageId) : "overview";
};

function usePage() {
  const [page, setPage] = useState<PageId>(pageFromHash);
  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return page;
}

// Each page fetches only its own history window.
function OverviewPage(p: { latest?: Reading; info: ReturnType<typeof useInfo>; device: ReturnType<typeof useDevice>; clock: number; tokens: Tokens }) {
  const now = useNow(120);
  const day = useReadings(now - 86400, now, 3600);
  return <Overview latest={p.latest} info={p.info} device={p.device} clock={p.clock} rows={day.rows} loading={day.loading} now={now} tokens={p.tokens} />;
}

function AnalyticsPage({ rangeId, tokens }: { rangeId: RangeId; tokens: Tokens }) {
  const range = RANGES.find((r) => r.id === rangeId)!;
  const now = useNow(range.refresh);
  const cur = useReadings(now - range.s, now, 3600);
  return <Analytics rows={cur.rows} loading={cur.loading} from={now - range.s} to={now} rangeLabel={range.name} tokens={tokens} />;
}

function EnergyPage({ tokens }: { tokens: Tokens }) {
  const now = useNow(600);
  const week = useReadings(todayStart() - 7 * 86400, now, 3600);
  return <Energy rows={week.rows} loading={week.loading} tokens={tokens} />;
}

export default function App() {
  const { mode, tokens: t, toggle } = useTheme();
  const page = usePage();
  const [rangeId, setRangeId] = useState<RangeId>(() => remembered("range", RANGES, "24h"));
  useEffect(() => remember("range", rangeId), [rangeId]);

  const [controlOpen, setControlOpen] = useState(false);

  const device = useDevice();
  const control = useControl();
  useControlWatcher(device, control);
  const info = useInfo();
  const latest = useLatest<Reading>("telemetry", 1)[0];
  const clock = useNow(5); // for "x s ago"

  const current = PAGES.find((p) => p.id === page)!;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <Zap size={18} strokeWidth={2.5} />
          </span>
          <div>
            <b>JK-BMS</b>
            <span>{info?.device_model ?? "JK-B1A8S10P"}</span>
          </div>
        </div>
        <nav aria-label="Pages">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} className={id === page ? "on" : ""} aria-current={id === page ? "page" : undefined}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{current.label}</h1>
            <p className="sub">
              {current.sub}
              {latest && (
                <>
                  {" · last reading "}
                  <Ago ts={latest.ts} />
                </>
              )}
            </p>
          </div>
          <div className="topbar-right">
            {page === "analytics" && <Segmented options={RANGES} value={rangeId} onChange={setRangeId} label="Time range" />}
            <button className="secondary rc-open" onClick={() => setControlOpen(true)} title="Firmware update and restart (password)">
              <SlidersHorizontal size={15} aria-hidden />
              <span>Remote control</span>
              {(control?.ota || control?.restart) && <i className="rc-dot" aria-label="Request pending" />}
            </button>
            <button className="icon-btn theme-icon" onClick={toggle} aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={mode === "dark" ? "Light mode" : "Dark mode"}>
              {mode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        {info?.errors ? (
          <div className="banner" role="alert">
            <StatusPill kind="critical">BMS alarm</StatusPill> {info.errors}
          </div>
        ) : null}

        {page === "overview" && <OverviewPage latest={latest} info={info} device={device} clock={clock} tokens={t} />}
        {page === "analytics" && <AnalyticsPage rangeId={rangeId} tokens={t} />}
        {page === "energy" && <EnergyPage tokens={t} />}
        {page === "device" && <DevicePage d={device} info={info} />}
      </main>

      <RemoteControl open={controlOpen} onClose={() => setControlOpen(false)} device={device} />

      <nav className="bottom-nav" aria-label="Pages">
        {PAGES.map(({ id, label, icon: Icon }) => (
          <a key={id} href={`#${id}`} className={id === page ? "on" : ""} aria-current={id === page ? "page" : undefined}>
            <Icon size={20} aria-hidden />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
