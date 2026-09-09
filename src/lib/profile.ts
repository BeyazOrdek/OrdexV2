/** ÖRDEX profile customization metadata shared by modals and chat rendering. */

/**
 * Read a locally picked image file and return it as a data URL. Non-GIF
 * bitmaps are downscaled through a canvas (avatar ≤ 256px, banner ≤ 512px,
 * long edge) so uploads stay small enough for the users document.
 * GIFs are passed through untouched (resampling would kill the animation).
 */
export async function readImageFile(file: File, kind: "avatar" | "banner"): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Lütfen bir görsel dosyası seç.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
  if (file.type === "image/gif") return dataUrl;

  const maxEdge = kind === "avatar" ? 256 : 512;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Görsel yüklenemedi."));
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // canvas unavailable — send original
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

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
