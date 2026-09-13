import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const sendMessage = mutation({
  args: {
    roomId: v.id("rooms"),
    text: v.optional(v.string()),
    gifUrl: v.optional(v.string()),
    gifThumb: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sohbet için giriş yapmalısın.");
    const user = await ctx.db.get(userId);
    const text = args.text?.trim().slice(0, 2000) || undefined;
    if (!text && !args.gifUrl) throw new Error("Mesaj boş olamaz.");
    // Resolve @name mentions to user ids so mention badges can fire.
    let mentionedUserIds: Id<"users">[] | undefined;
    if (text) {
      const names = new Set<string>();
      for (const m of text.matchAll(/@([\wçğıöşüÇĞİÖŞÜ.]{2,32})/gu)) {
        names.add(m[1].toLowerCase());
      }
      if (names.size > 0) {
        const users = await ctx.db.query("users").collect();
        mentionedUserIds = users
          .filter((u) => names.has((u.username ?? u.name ?? "").toLowerCase()))
          .map((u) => u._id);
        if (mentionedUserIds.length === 0) mentionedUserIds = undefined;
      }
    }
    await ctx.db.insert("messages", {
      roomId: args.roomId,
      userId,
      userName: user?.name ?? "Misafir",
      text,
      gifUrl: args.gifUrl,
      gifThumb: args.gifThumb,
      mentionedUserIds,
      createdAt: Date.now(),
    });
  },
});

export const listMessages = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(100);
  },
});

export const toggleReaction = mutation({
  args: { messageId: v.id("messages"), emoji: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .filter((q) => q.eq(q.field("emoji"), args.emoji))
      .filter((q) => q.eq(q.field("userId"), userId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    } else {
      const message = await ctx.db.get(args.messageId);
      if (!message) return;
      await ctx.db.insert("reactions", {
        messageId: args.messageId,
        roomId: message.roomId,
        emoji: args.emoji,
        userId,
      });
    }
  },
});

export const listReactions = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const all = await ctx.db
      .query("reactions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(300);
    return all;
  },
});

// ================= 📌 Pinned messages (room) =================

/** Pin/unpin a room message. Any signed-in member may toggle the pin. */
export const toggleRoomPin = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return;
    await ctx.db.patch(args.messageId, {
      pinned: !msg.pinned,
      pinnedByUserId: !msg.pinned ? userId : undefined,
    });
  },
});

/** All pinned messages of a room (banner order: oldest → newest). */
export const listPinnedRoomMessages = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(200);
    const pinned = rows.filter((m) => m.pinned);
    const byIds = await Promise.all(
      pinned.map(async (m) => {
        const pinner = m.pinnedByUserId ? await ctx.db.get(m.pinnedByUserId) : null;
        return {
          _id: m._id,
          userName: m.userName,
          text: m.text,
          gifThumb: m.gifThumb,
          createdAt: m.createdAt,
          pinnedByName: pinner?.name ?? "Bilinmeyen",
        };
      }),
    );
    return byIds.reverse();
  },
});
