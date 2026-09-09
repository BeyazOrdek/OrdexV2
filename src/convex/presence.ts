import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { deleteRoomCascade, ROOM_CLOSED_ERROR } from "./rooms";

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
    isSharing: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const now = Date.now();
    // Room was auto-deleted (everyone left)? Do not resurrect it with a new
    // presence row — tell the client it is closed instead.
    if (!(await ctx.db.get(args.roomId))) throw new Error(ROOM_CLOSED_ERROR);
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
        isSharing: args.isSharing ?? false,
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
        isSharing: args.isSharing ?? false,
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
    if (!row) return;
    const roomId = row.roomId;
    const wasSharing = row.isSharing === true;
    await ctx.db.delete(row._id);
    // Auto room cleanup: if the last occupant just left, delete the room and
    // everything attached to it. The reactive room lists on every connected
    // client update instantly — the equivalent of a `room-deleted` broadcast.
    const remaining = await ctx.db
      .query("presence")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(1);
    if (remaining.length === 0) {
      // Young-room grace: React StrictMode's dev double-mount fires leave()
      // right after the first heartbeat, and the room creator is usually the
      // only occupant at that moment. Cascade-deleting here killed rooms a
      // few seconds old — the client then saw a "connecting" spinner forever.
      // Rooms younger than GRACE_MS are left alive for cleanupStaleRooms,
      // which sweeps them once their presence goes stale.
      const GRACE_MS = 60_000;
      const room = await ctx.db.get(roomId);
      if (room && Date.now() - room.createdAt >= GRACE_MS) {
        await deleteRoomCascade(ctx, roomId);
      }
      return;
    }
    if (wasSharing) {
      // The sharer left: clear the broadcast flag on the user's remaining
      // presence rows so nobody subscribes to a dead stream.
      const userRows = await ctx.db
        .query("presence")
        .withIndex("by_user", (q) => q.eq("userId", row.userId))
        .collect();
      await Promise.all(
        userRows
          .filter((r) => r.isSharing === true)
          .map((r) => ctx.db.patch(r._id, { isSharing: false })),
      );
    }
  },
});

/** Online status (fresh presence) for a set of users — powers friend online/offline dots. */
export const listUsersPresence = query({
  args: { userIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const FRESH_MS = 35_000;
    const unique = [...new Set(args.userIds)].slice(0, 200);
    const rows = await Promise.all(
      unique.map(async (userId) => ({
        userId,
        sessions: await ctx.db
          .query("presence")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      })),
    );
    return rows.map(({ userId, sessions }) => {
      const fresh = sessions.filter((s) => now - s.lastSeen < FRESH_MS);
      return {
        userId,
        online: fresh.length > 0,
        inVoice: fresh.some((s) => s.inVoice),
        isSharing: fresh.some((s) => s.isSharing === true),
      };
    });
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
