import { v } from "convex/values";
import { httpAction } from "./_generated/server";
import { action } from "./_generated/server";

const TenorResult = v.object({
  id: v.string(),
  url: v.string(),
  preview: v.string(),
  desc: v.string(),
});

export interface TenorGif {
  id: string;
  url: string;
  preview: string;
  desc: string;
}

interface TenorMediaFormat {
  url?: string;
}
interface TenorGifObject {
  id: string;
  content_description?: string;
  media_formats?: Record<string, TenorMediaFormat>;
}

/**
 * Tenor proxy core: server-side search/featured fetch so the API key never
 * reaches the browser. Used by both the chat action and the public
 * GET /api/gifs HTTP endpoint (handy for curl / integrations).
 */
export async function fetchTenorGifs(
  query: string,
): Promise<{ error?: string; gifs: TenorGif[] }> {
  const key = process.env.TENOR_API_KEY;
  if (!key) {
    return {
      error:
        "Tenor API anahtarı eksik. Keys/API keys sekmesine TENOR_API_KEY ekleyerek GIF aramasını aktif edebilirsin.",
      gifs: [],
    };
  }
  const q = query.trim();
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
    const gifs = (data.results ?? [])
      .map((r) => ({
        id: r.id,
        url: r.media_formats?.mediumgif?.url ?? r.media_formats?.tinygif?.url ?? "",
        preview: r.media_formats?.tinygif?.url ?? r.media_formats?.mediumgif?.url ?? "",
        desc: r.content_description ?? "GIF",
      }))
      .filter((g) => g.url && g.preview);
    return { gifs };
  } catch {
    return { error: "Tenor'a erişilemedi, tekrar dene.", gifs: [] };
  }
}

/** Convex action wrapper used by the chat GIF picker. */
export const searchGifs = action({
  args: { query: v.string() },
  returns: v.object({
    error: v.optional(v.string()),
    gifs: v.array(TenorResult),
  }),
  handler: async (_ctx, args) => {
    return await fetchTenorGifs(args.query);
  },
});

const httpCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Public proxy endpoint: GET /api/gifs?q=<query>
 * Returns { error?: string, gifs: [{ id, url, preview, desc }] } as JSON.
 * CORS is open so external tools / curl can call it directly.
 */
export const gifsProxy = httpAction(async (_ctx, request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: httpCors });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
  const result = await fetchTenorGifs(q);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json", ...httpCors },
  });
});
