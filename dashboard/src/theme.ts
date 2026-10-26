import { useEffect, useState } from "react";

// Series hues: validated reference palette (dataviz skill, references/palette.md), slots in fixed order.
// Neutrals are cool slate steps; every chart still ships a legend and a table view.
export interface Tokens {
  surface: string;
  page: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  shadow: string;
  series: string[]; // categorical slots 1..8
  good: string;
  warning: string;
  serious: string;
  critical: string;
}

const light: Tokens = {
  surface: "#ffffff",
  page: "#f4f6f9",
  ink: "#0f172a",
  ink2: "#475569",
  muted: "#64748b",
  grid: "#edf0f4",
  axis: "#d5dbe3",
  shadow: "rgba(15, 23, 42, 0.10)",
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

const dark: Tokens = {
  surface: "#151a21",
  page: "#0b0e13",
  ink: "#e6e9ef",
  ink2: "#a3adbb",
  muted: "#7d8796",
  grid: "#222932",
  axis: "#303846",
  shadow: "rgba(0, 0, 0, 0.45)",
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

/** Light until the viewer picks dark with the toggle; the pick is remembered per browser. */
export function useTheme() {
  const [mode, setMode] = useState<Mode>(() => stored() ?? "light");
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
