import { useEffect, useState } from "react";

export type ThemeId = "ordex-dark" | "oled" | "violet" | "emerald" | "cyberpunk" | "crimson";

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  desc: string;
  swatch: [string, string, string];
}

export const ORDEX_THEMES: ThemeMeta[] = [
  {
    id: "ordex-dark",
    label: "YouTube Premium Dark",
    desc: "Varsayılan koyu siyah & kırmızı",
    swatch: ["#0b0c0e", "#131518", "#ff0000"],
  },
  {
    id: "oled",
    label: "OLED Pure Black",
    desc: "Kapkara OLED uyumlu saf siyah",
    swatch: ["#000000", "#111111", "#ff0000"],
  },
  {
    id: "violet",
    label: "Midnight Violet",
    desc: "Koyu mor / Discord vibe",
    swatch: ["#12101a", "#1e1a2b", "#7c5cff"],
  },
  {
    id: "emerald",
    label: "Emerald Night",
    desc: "Derin zümrüt yeşili & koyu",
    swatch: ["#071410", "#10231c", "#10b981"],
  },
  {
    id: "cyberpunk",
    label: "Cyberpunk Neon",
    desc: "Koyu mavi & neon sarı/pembe",
    swatch: ["#0a0f1e", "#1a2745", "#fcee0a"],
  },
  {
    id: "crimson",
    label: "Crimson Velvet",
    desc: "Koyu bordo & kırmızı parıltı",
    swatch: ["#140a0e", "#241519", "#ff3355"],
  },
];

const STORAGE_KEY = "ordex:theme";

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

export function storedTheme(): ThemeId | null {
  try {
    return localStorage.getItem(STORAGE_KEY) as ThemeId | null;
  } catch {
    return null;
  }
}

/** Applies the persisted theme on boot and exposes the setter. */
export function useTheme(): { theme: ThemeId; setTheme: (id: ThemeId) => void } {
  const [theme, setThemeState] = useState<ThemeId>(() => storedTheme() ?? "ordex-dark");
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  return { theme, setTheme: setThemeState };
}
