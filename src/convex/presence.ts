import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Called every ~10s and whenever voice state changes. Keeps the participant list fresh. */
export const heartbeat = mutation({
  args: {
    roomId: v.id("rooms"),
    sessionId: v.string(),
    userName: v.string(),
    avatarHue: v.number(),
    inVoice: v.boolean(),
    micOn: v.boolean(),
    camOn: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const now = Date.now();
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        roomId: args.roomId,
        userName: args.userName,
        avatarHue: args.avatarHue,
        inVoice: args.inVoice,
        micOn: args.micOn,
        camOn: args.camOn,
        lastSeen: now,
      });
    } else {
      await ctx.db.insert("presence", {
        roomId: args.roomId,
        sessionId: args.sessionId,
        userId,
        userName: args.userName,
        avatarHue: args.avatarHue,
        inVoice: args.inVoice,
        micOn: args.micOn,
        camOn: args.camOn,
        joinedAt: now,
        lastSeen: now,
      });
    }
    // Opportunistically drop stale sessions (crashed tabs etc.).
    const stale = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.lt(q.field("lastSeen"), now - 60_000))
      .take(50);
    await Promise.all(stale.map((row) => ctx.db.delete(row._id)));
  },
});

export const leave = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("presence")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (row) await ctx.db.delete(row._id);
  },
});

export const listPresence = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
  },
});
