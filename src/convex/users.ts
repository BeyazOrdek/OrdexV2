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
    };
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
          (u.name ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .slice(0, 10)
      .map((u) => ({
        _id: u._id,
        name: u.name ?? "Misafir",
        statusMessage: u.statusMessage,
        avatarUrl: u.avatarUrl,
      }));
  },
});

/** Update the signed-in user's display name, status message and avatar url. */
export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    statusMessage: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const patch: Record<string, string | undefined> = {};
    if (args.name !== undefined) {
      const name = args.name.trim().slice(0, 32);
      if (name) patch.name = name;
    }
    if (args.statusMessage !== undefined) {
      patch.statusMessage = args.statusMessage.trim().slice(0, 120) || undefined;
    }
    if (args.avatarUrl !== undefined) {
      // Accept http(s) image/gif urls (e.g. a Tenor gif link) or clear with "".
      const url = args.avatarUrl.trim();
      if (url && /^https?:\/\//i.test(url)) patch.avatarUrl = url;
      else if (!url) patch.avatarUrl = undefined;
    }
    await ctx.db.patch(userId, patch);
  },
});
