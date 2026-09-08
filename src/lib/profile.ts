/** ÖRDEX profile customization metadata shared by modals and chat rendering. */

export interface BadgeMeta {
  id: string;
  label: string;
  icon: string;
  className: string;
}

export const BADGES: BadgeMeta[] = [
  { id: "founder", label: "Kurucu", icon: "👑", className: "bg-amber-500/15 text-amber-300 border-amber-400/30" },
  { id: "vip", label: "VIP", icon: "💎", className: "bg-violet-500/15 text-violet-300 border-violet-400/30" },
  { id: "premium", label: "Premium", icon: "⚡", className: "bg-[var(--ordex-accent)]/15 text-[var(--ordex-accent)] border-[var(--ordex-accent)]/40" },
  { id: "mod", label: "Moderatör", icon: "🛡️", className: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" },
  { id: "gamer", label: "Gamer", icon: "🎮", className: "bg-sky-500/15 text-sky-300 border-sky-400/30" },
  { id: "cinephile", label: "Cinephile", icon: "🎬", className: "bg-rose-500/15 text-rose-300 border-rose-400/30" },
];

export const BADGE_IDS = BADGES.map((b) => b.id);

export function badgeMeta(id: string): BadgeMeta | undefined {
  return BADGES.find((b) => b.id === id);
}

export const STATUS_PRESETS = [
  "🎬 Film izliyor",
  "🎮 Oyun oynuyor",
  "🎵 Müzik dinliyor",
  "💤 Boşta",
  "📚 Ders çalışıyor",
  "🌍 Uzakta",
];

export const NAME_COLOR_PRESETS = [
  "#ff4d4d",
  "#ffa94d",
  "#ffd43b",
  "#51cf66",
  "#22d3ee",
  "#7c5cff",
  "#f472b6",
  "#e7e8ea",
];

export const BANNER_PRESETS = [
  "linear-gradient(135deg, #b91c1c, #450a0a)",
  "linear-gradient(135deg, #4c1d95, #1e1b4b)",
  "linear-gradient(135deg, #065f46, #022c22)",
  "linear-gradient(135deg, #0369a1, #082f49)",
  "linear-gradient(135deg, #be185d, #500724)",
  "linear-gradient(135deg, #334155, #0f172a)",
];
