import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * WebRTC signaling relay. Peers subscribe to signals addressed to their
 * sessionId, handle them, then delete each one after processing.
 */
export const sendSignal = mutation({
  args: {
    roomId: v.id("rooms"),
    fromSession: v.string(),
    toSession: v.string(),
    kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    await ctx.db.insert("signals", {
      roomId: args.roomId,
      fromSession: args.fromSession,
      toSession: args.toSession,
      kind: args.kind,
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

export const listSignals = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("signals")
      .withIndex("by_to", (q) => q.eq("toSession", args.sessionId))
      .order("asc")
      .take(100);
  },
});

export const deleteSignal = mutation({
  args: { signalId: v.id("signals") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.signalId);
  },
});
