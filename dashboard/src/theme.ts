import { useEffect, useState } from "react";

// Validated reference palette (dataviz skill, references/palette.md): slots in fixed order.
// Light slots 3 and 4 are below 3:1 on the light surface, so every chart ships a legend and a table view.
export interface Tokens {
  surface: string;
  page: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  series: string[]; // categorical slots 1..8
  good: string;
  warning: string;
  serious: string;
  critical: string;
}

const light: Tokens = {
  surface: "#fcfcfb",
  page: "#f9f9f7",
  ink: "#0b0b0b",
  ink2: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

const dark: Tokens = {
  surface: "#1a1a19",
  page: "#0d0d0d",
  ink: "#f0efec",
  ink2: "#c3c2b7",
  muted: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export type Mode = "light" | "dark";

function stored(): Mode | null {
  try {
    const v = localStorage.getItem("theme");
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

/** Theme follows the OS until the viewer picks one; the pick is remembered per browser. */
export function useTheme() {
  const system = () => (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const [mode, setMode] = useState<Mode>(() => stored() ?? system());
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);
  const toggle = () =>
    setMode((m) => {
      const next = m === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* private mode: keep it for this visit only */
      }
      return next;
    });
  return { mode, tokens: mode === "dark" ? dark : light, toggle };
}
