import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

// ---------- ÖRDEX profile + user lookup ----------

/** Public projection of a user (never leaks email). */
export const getUserInfo = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name ?? "Misafir",
      statusMessage: user.statusMessage,
      avatarUrl: user.avatarUrl,
      bannerColor: user.bannerColor,
      bannerUrl: user.bannerUrl,
      nameColor: user.nameColor,
      badges: user.badges,
    };
  },
});

/** Batched public projection used by chat/presence to render rich profiles. */
export const getUsersPublic = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const unique = [...new Set(args.userIds)].slice(0, 100);
    const users = await Promise.all(unique.map((id) => ctx.db.get(id)));
    return users
      .filter((u): u is NonNullable<typeof u> => u !== null)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Misafir",
        statusMessage: u.statusMessage,
        avatarUrl: u.avatarUrl,
        bannerColor: u.bannerColor,
        bannerUrl: u.bannerUrl,
        nameColor: u.nameColor,
        badges: u.badges,
      }));
  },
});

/**
 * Hard cap for local image uploads stored as data URLs (Convex documents are
 * 8 MB total; the client also downscales before sending, so this is a guard,
 * not the primary limit).
 */
const MAX_UPLOAD_CHARS = 280_000;

/**
 * Ensure the signed-in user has a unique lowercase username.
 * - Guests (isAnonymous) get the stable Guest_#### format, persisted on the
 *   account so page refreshes and reconnects never produce a new identity.
 * - Registered accounts default to their display name when free.
 * Returns the effective username. Safe to call on every sign-in.
 */
export const ensureUsername = mutation({
  args: { preferred: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Kullanıcı bulunamadı.");
    if (user.username) return { username: user.username };

    const taken = async (candidate: string) =>
      Boolean(
        await ctx.db
          .query("users")
          .withIndex("by_username", (q) => q.eq("username", candidate))
          .unique(),
      );

    let claimed: string | null = null;
    if (user.isAnonymous) {
      // Guests: try the browser's persisted Guest_#### handle first, then fall
      // back to random handles in the same format until one is free.
      const preferred = args.preferred ?? "";
      if (/^Guest_\d{4}$/.test(preferred) && !(await taken(preferred.toLowerCase()))) {
        claimed = preferred;
      }
      for (let i = 0; !claimed && i < 20; i++) {
        const candidate = `guest_${Math.floor(1000 + Math.random() * 9000)}`;
        if (!(await taken(candidate))) claimed = candidate;
      }
    } else {
      // Registered: prefer a slug of the display name, suffix on collision.
      const base =
        (user.name ?? "user").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20) || "user";
      if (!(await taken(base))) claimed = base;
      for (let i = 0; !claimed && i < 8; i++) {
        const candidate = `${base}_${Math.floor(10 + Math.random() * 90)}`;
        if (!(await taken(candidate))) claimed = candidate;
      }
      if (!claimed) claimed = `${base}_${Date.now().toString(36)}`;
    }

    if (!claimed) throw new Error("Kullanıcı adı ayrılanamadı, tekrar dene.");
    const patch: { username: string; name?: string } = { username: claimed };
    if (user.isAnonymous && (!user.name || user.name === "Misafir")) {
      // Guests display their handle (Guest_1234) by default.
      patch.name = claimed.replace(/\bguest\b/i, (m) => m[0].toUpperCase() + m.slice(1));
    }
    await ctx.db.patch(userId, patch);
    return { username: claimed };
  },
});

/** Search users by name (substring match, min 2 chars) for the add-friend flow. */
export const searchUsers = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const meId = await getAuthUserId(ctx);
    if (meId === null) return [];
    const q = args.name.trim().toLowerCase();
    if (q.length < 2) return [];
    const users = await ctx.db.query("users").collect();
    return users
      .filter(
        (u) =>
          u._id !== meId &&
          ((u.name ?? "").toLowerCase().includes(q) ||
            (u.username ?? "").includes(q)),
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .slice(0, 10)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Misafir",
        statusMessage: u.statusMessage,
        avatarUrl: u.avatarUrl,
        nameColor: u.nameColor,
        badges: u.badges,
      }));
  },
});

/** Update the signed-in user's display name, status message and avatar url. */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    statusMessage: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    bannerColor: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    nameColor: v.optional(v.string()),
    badges: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const patch: Record<string, string | string[] | undefined> = {};
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, 32);
      if (name) patch.name = name;
    }
    if (args.statusMessage !== undefined) {
      patch.statusMessage = args.statusMessage.trim().slice(0, 120) || undefined;
    }
    if (args.avatarUrl !== undefined) {
      // Accept http(s) image/gif urls (e.g. a Tenor gif link), a local-upload
      // data URL (small images downscaled client-side), or clear with "".
      const url = args.avatarUrl.trim();
      if (!url) patch.avatarUrl = undefined;
      else if (url.startsWith("data:image/")) {
        if (url.length <= MAX_UPLOAD_CHARS) patch.avatarUrl = url;
        else throw new Error("Yüklenen görsel çok büyük — daha küçük bir dosya seç.");
      } else if (/^https?:\/\//i.test(url)) patch.avatarUrl = url;
    }
    if (args.bannerColor !== undefined) {
      const color = args.bannerColor.trim();
      patch.bannerColor = color && /^(#[0-9a-f]{3,8}|rgba?\(|hsl\(|var\(--)/i.test(color) ? color.slice(0, 60) : undefined;
    }
    if (args.bannerUrl !== undefined) {
      const url = args.bannerUrl.trim();
      if (!url) patch.bannerUrl = undefined;
      else if (url.startsWith("data:image/")) {
        if (url.length <= MAX_UPLOAD_CHARS) patch.bannerUrl = url;
        else throw new Error("Yüklenen görsel çok büyük — daha küçük bir dosya seç.");
      } else if (/^https?:\/\//i.test(url)) patch.bannerUrl = url;
    }
    if (args.nameColor !== undefined) {
      const color = args.nameColor.trim();
      patch.nameColor = color && /^(#[0-9a-f]{3,8}|rgba?\(|hsl\(|var\(--)/i.test(color) ? color.slice(0, 60) : undefined;
    }
    if (args.badges !== undefined) {
      const allowed = ["founder", "vip", "premium", "mod", "gamer", "cinephile"];
      patch.badges = args.badges.filter((b) => allowed.includes(b)).slice(0, 6);
    }
    await ctx.db.patch(userId, patch as never);
  },
});
