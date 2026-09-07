import { action } from "./_generated/server";
import { v } from "convex/values";

const TenorResult = v.object({
  id: v.string(),
  url: v.string(),
  preview: v.string(),
  desc: v.string(),
});

interface TenorMediaFormat {
  url?: string;
}
interface TenorGifObject {
  id: string;
  content_description?: string;
  media_formats?: Record<string, TenorMediaFormat>;
}

/**
 * Search Tenor for GIFs (or fetch featured/trending when query is empty).
 * Requires TENOR_API_KEY in the environment (Keys/API keys tab).
 */
export const searchGifs = action({
  args: { query: v.string() },
  returns: v.object({
    error: v.optional(v.string()),
    gifs: v.array(TenorResult),
  }),
  handler: async (_ctx, args) => {
    const key = process.env.TENOR_API_KEY;
    if (!key) {
      return {
        error:
          "Tenor API anahtarı eksik. Keys/API keys sekmesine TENOR_API_KEY ekleyerek GIF aramasını aktif edebilirsin.",
        gifs: [],
      };
    }
    const q = args.query.trim();
    const endpoint = q
      ? "https://tenor.googleapis.com/v2/search"
      : "https://tenor.googleapis.com/v2/featured";
    const params = new URLSearchParams({
      key,
      client_key: "senkron_web",
      limit: "24",
      media_filter: "mediumgif,tinygif",
      contentfilter: "medium",
    });
    if (q) params.set("q", q);
    try {
      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        return {
          error: `Tenor isteği başarısız oldu (HTTP ${res.status}).`,
          gifs: [],
        };
      }
      const data = (await res.json()) as { results?: TenorGifObject[] };
      const gifs = (data.results ?? []).map((r) => ({
        id: r.id,
        url: r.media_formats?.mediumgif?.url ?? r.media_formats?.tinygif?.url ?? "",
        preview: r.media_formats?.tinygif?.url ?? r.media_formats?.mediumgif?.url ?? "",
        desc: r.content_description ?? "GIF",
      })).filter((g) => g.url && g.preview);
      return { gifs };
    } catch {
      return { error: "Tenor'a erişilemedi, tekrar dene.", gifs: [] };
    }
  },
});
