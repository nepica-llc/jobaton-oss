import { useState, useEffect } from "react";

export type Theme = "light" | "dark";

// The theme follows the local time: light from 07:00 to 19:00, dark otherwise (#38).
// A manual toggle holds until the next switch time, then the clock takes over again.
// Keep in sync with the inline script in index.html, which applies it before first paint.
const DAY_START = 7, DAY_END = 19;
const KEY = "jobaton_theme_override";

export function timeTheme(d = new Date()): Theme {
  const h = d.getHours();
  return h >= DAY_START && h < DAY_END ? "light" : "dark";
}

function nextSwitch(d = new Date()): number {
  const n = new Date(d);
  const h = d.getHours();
  if (h < DAY_START) n.setHours(DAY_START, 0, 0, 0);
  else if (h < DAY_END) n.setHours(DAY_END, 0, 0, 0);
  else { n.setDate(n.getDate() + 1); n.setHours(DAY_START, 0, 0, 0); }
  return n.getTime();
}

function current(): Theme {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "null");
    if ((o?.theme === "light" || o?.theme === "dark") && Date.now() < o.until) return o.theme;
  } catch { /* storage blocked: use the clock */ }
  return timeTheme();
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // Switch at 07:00 / 19:00 while the app is open.
  useEffect(() => {
    const t = setInterval(() => setTheme(current()), 60_000);
    return () => clearInterval(t);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, JSON.stringify({ theme: next, until: nextSwitch() })); } catch { /* keeps for this session only */ }
    setTheme(next);
  };

  return { theme, setTheme, toggle };
}
