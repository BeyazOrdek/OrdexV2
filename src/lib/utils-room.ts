/** Shared helpers for the Senkron watch-together app. */

export function getSessionId(): string {
  // Stable per-tab id for presence + WebRTC signaling.
  let id = sessionStorage.getItem("senkron:sessionId");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("senkron:sessionId", id);
  }
  return id;
}

/**
 * Guest identity: reserve a unique Guest_#### handle once per browser and
 * persist it in localStorage, so page refreshes and reconnects keep the same
 * non-colliding temporary ID (server double-checks uniqueness on claim).
 */
export function ensureGuestUsername(): string {
  let name = localStorage.getItem("senkron:guestUsername");
  if (!name || !/^Guest_\d{4}$/.test(name)) {
    name = `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem("senkron:guestUsername", name);
  }
  return name;
}

export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) % 360;
  }
  return h;
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor((totalSeconds / 60) % 60);
  const h = Math.floor(totalSeconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Extract a YouTube video id from many URL shapes (watch, youtu.be, shorts, embed, live). */
export function parseYouTube(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // Bare 11-char id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (!host.endsWith("youtube.com") && !host.endsWith("youtube-nocookie.com")) {
      return null;
    }
    const vParam = url.searchParams.get("v");
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) return vParam;
    const parts = url.pathname.split("/").filter(Boolean);
    const keyed = ["shorts", "embed", "live", "v"];
    for (let i = 0; i < parts.length; i++) {
      if (keyed.includes(parts[i]) && parts[i + 1]) {
        const id = parts[i + 1];
        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function thumbFor(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export type MediaKind = "youtube" | "direct";

export interface ParsedMediaLink {
  type: MediaKind;
  /** Media key stored in room state / queue: YouTube id, or the full URL. */
  key: string;
  /** For direct files: the playback URL (same as key). */
  url?: string;
  title: string;
  thumb?: string;
}

const DIRECT_EXT = /\.(mp4|webm|m4v|mov|ogv|ogg)(\?|#|$)/i;

/**
 * Classify any pasted link. Direct files (.mp4/.webm/tau-video CDN links etc.)
 * play in a raw HTML5 <video>; YouTube links go through the IFrame API.
 * Returns null only for text that is neither a URL nor a YouTube id.
 */
export function parseMediaLink(input: string): ParsedMediaLink | null {
  const raw = input.trim();
  if (!raw) return null;

  // Bare YouTube id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) {
    return { type: "youtube", key: raw, title: raw, thumb: thumbFor(raw) };
  }

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.replace(/^www\./, "");

    // YouTube (watch, youtu.be, shorts, embed, live, nocookie).
    if (host === "youtu.be" || host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const id = parseYouTube(raw);
      if (id) return { type: "youtube", key: id, title: id, thumb: thumbFor(id) };
    }

    // Direct video files: extension in the path, or known tau-video style links.
    if (DIRECT_EXT.test(url.pathname) || /tau-video|taucdn/i.test(`${host}${url.pathname}`)) {
      const fileName = decodeURIComponent(url.pathname.split("/").pop() ?? "video");
      return {
        type: "direct",
        key: url.toString(),
        url: url.toString(),
        title: fileName || "Video",
        thumb: undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}
