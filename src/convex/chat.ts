import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
    await ctx.db.insert("messages", {
      roomId: args.roomId,
      userId,
      userName: user?.name ?? "Misafir",
      text,
      gifUrl: args.gifUrl,
      gifThumb: args.gifThumb,
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
