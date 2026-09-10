import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------- ÖRDEX social: friends + direct messages ----------

async function requireUser(ctx: { auth: unknown }) {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Giriş yapmalısın.");
  return userId;
}

/**
 * Read-only queries return safe defaults when auth is not attached yet;
 * a throwing reactive query crashes the whole React tree.
 */
async function currentUserId(ctx: { auth: unknown }): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx as never);
}

async function publicUser(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return { _id: userId, name: "Bilinmeyen" };
  return {
    _id: user._id,
    name: user.name ?? "Misafir",
    statusMessage: user.statusMessage,
    avatarUrl: user.avatarUrl,
    nameColor: user.nameColor,
    badges: user.badges,
  };
}

/** All accepted friends of the current user (rich user objects). */
export const listFriends = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const rows = await ctx.db
      .query("friendships")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    const accepted = rows.filter((r) => r.status === "accepted");
    const friends = await Promise.all(accepted.map((r) => publicUser(ctx, r.friendId)));
    return friends.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Incoming friend requests (people who asked me). */
export const listIncomingRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const rows = await ctx.db
      .query("friendships")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    const incoming = rows.filter((r) => r.status === "pending" && r.requestedBy !== me);
    return await Promise.all(
      incoming.map(async (r) => ({ ...(await publicUser(ctx, r.requestedBy)), createdAt: r.createdAt })),
    );
  },
});

/** Outgoing friend requests (people I asked). */
export const listOutgoingRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const rows = await ctx.db
      .query("friendships")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    const outgoing = rows.filter((r) => r.status === "pending" && r.requestedBy === me);
    return await Promise.all(
      outgoing.map(async (r) => ({ ...(await publicUser(ctx, r.friendId)), createdAt: r.createdAt })),
    );
  },
});

/** Existing friendship state between me and another user (for username hover actions). */
export const friendshipState = query({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await currentUserId(ctx);
    if (me === null) return { state: "none" as const };
    if (me === args.otherUserId) return { state: "self" as const };
    const pair = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("userId", me).eq("friendId", args.otherUserId))
      .unique();
    if (!pair) return { state: "none" as const };
    if (pair.status === "accepted") return { state: "friends" as const };
    return { state: pair.requestedBy === me ? ("outgoing" as const) : ("incoming" as const) };
  },
});

/** Send a friend request by username (exact match) or directly by user id. */
export const sendFriendRequest = mutation({
  args: { name: v.optional(v.string()), userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    let targetId = args.userId ?? null;
    if (!targetId && args.name) {
      const q = args.name.trim().toLowerCase();
      const users = await ctx.db.query("users").collect();
      const target = users.find((u) => (u.name ?? "").toLowerCase() === q);
      if (!target) throw new Error("Bu kullanıcı adı bulunamadı.");
      if (target._id === me) throw new Error("Kendine arkadaşlık isteği gönderemezsin.");
      targetId = target._id;
    }
    if (!targetId) throw new Error("Kullanıcı belirtilmedi.");
    if (targetId === me) throw new Error("Kendine arkadaşlık isteği gönderemezsin.");

    // If the other side already requested me, auto-accept instead.
    const reverse = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("userId", targetId).eq("friendId", me))
      .unique();
    if (reverse && reverse.status === "pending") {
      await ctx.db.patch(reverse._id, { status: "accepted" });
      await ctx.db.insert("friendships", {
        userId: me,
        friendId: targetId,
        status: "accepted",
        requestedBy: reverse.requestedBy,
        createdAt: Date.now(),
      });
      return { state: "friends" as const };
    }
    if (reverse && reverse.status === "accepted") {
      return { state: "friends" as const };
    }

    const mine = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("userId", me).eq("friendId", targetId))
      .unique();
    if (mine) {
      if (mine.status === "accepted") return { state: "friends" as const };
      throw new Error("Zaten bekleyen bir isteğin var.");
    }
    await ctx.db.insert("friendships", {
      userId: me,
      friendId: targetId,
      status: "pending",
      requestedBy: me,
      createdAt: Date.now(),
    });
    return { state: "outgoing" as const };
  },
});

/** Accept an incoming friend request. */
export const acceptFriendRequest = mutation({
  args: { requesterId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const row = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("userId", me).eq("friendId", args.requesterId))
      .unique();
    if (!row || row.status !== "pending" || row.requestedBy === me) {
      throw new Error("Bekleyen bir istek yok.");
    }
    await ctx.db.patch(row._id, { status: "accepted" });
    // Mirror direction so both lists resolve instantly.
    const mirror = await ctx.db
      .query("friendships")
      .withIndex("by_pair", (q) => q.eq("userId", args.requesterId).eq("friendId", me))
      .unique();
    if (!mirror) {
      await ctx.db.insert("friendships", {
        userId: args.requesterId,
        friendId: me,
        status: "accepted",
        requestedBy: row.requestedBy,
        createdAt: Date.now(),
      });
    } else {
      await ctx.db.patch(mirror._id, { status: "accepted" });
    }
  },
});

/** Decline an incoming request or cancel an outgoing one. */
export const removeFriend = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    for (const [a, b] of [
      [me, args.otherUserId],
      [args.otherUserId, me],
    ] as const) {
      const row = await ctx.db
        .query("friendships")
        .withIndex("by_pair", (q) => q.eq("userId", a).eq("friendId", b))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
  },
});

/** Full DM history between me and another user. */
export const listDms = query({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const sent = await ctx.db
      .query("dms")
      .withIndex("by_pair", (q) => q.eq("senderId", me).eq("recipientId", args.otherUserId))
      .collect();
    const received = await ctx.db
      .query("dms")
      .withIndex("by_pair", (q) => q.eq("senderId", args.otherUserId).eq("recipientId", me))
      .collect();
    return [...sent, ...received]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((d) => ({ ...d, mine: d.senderId === me }));
  },
});

/** Contacts I've DM'd with (for the DM tab list). */
export const listDmContacts = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const rows = await ctx.db.query("dms").collect();
    const contactIds = new Map<string, number>();
    for (const d of rows) {
      if (d.senderId === me) contactIds.set(d.recipientId, Math.max(contactIds.get(d.recipientId) ?? 0, d.createdAt));
      else if (d.recipientId === me) contactIds.set(d.senderId, Math.max(contactIds.get(d.senderId) ?? 0, d.createdAt));
    }
    const contacts = await Promise.all(
      [...contactIds.entries()].map(async ([id, lastAt]) => ({
        ...(await publicUser(ctx, id as Id<"users">)),
        lastAt,
      })),
    );
    return contacts.sort((a, b) => b.lastAt - a.lastAt);
  },
});

/** Send a direct message (text or GIF) to a friend/user. */
export const sendDm = mutation({
  args: {
    recipientId: v.id("users"),
    text: v.optional(v.string()),
    gifUrl: v.optional(v.string()),
    gifThumb: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const text = args.text?.trim().slice(0, 2000);
    if (!text && !args.gifUrl) throw new Error("Mesaj boş.");
    await ctx.db.insert("dms", {
      senderId: me,
      recipientId: args.recipientId,
      text: text || undefined,
      gifUrl: args.gifUrl,
      gifThumb: args.gifThumb,
      createdAt: Date.now(),
    });
  },
});
