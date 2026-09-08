import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const mediaTypeValidator = v.union(v.literal("youtube"), v.literal("direct"));

/**
 * Secret rooms never appear in any public listing; they are joinable only via
 * their 6-char code or direct link. Kept as a constant so query + mutations agree.
 */
const SECRET_VISIBILITY = "secret" as const;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function requireUser(ctx: { auth: unknown }) {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Odaya katılmak için giriş yapmalısın.");
  return userId;
}

// ---------- Queries ----------

export const getRoomByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!code) return null;
    return await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
  },
});

export const listMyRooms = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const rooms = await Promise.all(
      memberships
        .sort((a, b) => b.joinedAt - a.joinedAt)
        .slice(0, 20)
        .map(async (m) => await ctx.db.get(m.roomId)),
    );
    return rooms.filter((r) => r !== null);
  },
});

export const listPublicRooms = query({
  args: {},
  handler: async (ctx) => {
    // Privacy filter: secret rooms are NEVER listed here (requirement #2).
    return (await ctx.db.query("rooms").order("desc").take(30))
      .filter((r) => (r.visibility ?? "public") !== SECRET_VISIBILITY)
      .slice(0, 20);
  },
});

// ---------- Room lifecycle ----------

export const createRoom = mutation({
  args: { name: v.string(), visibility: v.optional(v.union(v.literal("public"), v.literal("secret"))) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const name = args.name.trim().slice(0, 60) || "İsimsiz Oda";
    let code = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_code", (q) => q.eq("code", code))
        .unique();
      if (!existing) break;
      code = generateRoomCode();
    }
    const roomId = await ctx.db.insert("rooms", {
      code,
      name,
      createdByUserId: userId,
      createdByName: user?.name ?? "Misafir",
      createdAt: Date.now(),
      visibility: args.visibility ?? "public",
      isPlaying: false,
      positionSec: 0,
      mediaUpdatedAt: Date.now(),
      mediaUpdatedBy: "",
    });
    await ctx.db.insert("memberships", { roomId, userId, joinedAt: Date.now() });
    return { code, roomId };
  },
});

export const joinRoom = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const code = args.code.trim().toUpperCase();
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!room) throw new Error("Bu kodla bir oda bulunamadı.");
    const existing = await ctx.db
      .query("memberships")
      .withIndex("by_room_user", (q) =>
        q.eq("roomId", room._id).eq("userId", userId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("memberships", {
        roomId: room._id,
        userId,
        joinedAt: Date.now(),
      });
    }
    return { roomId: room._id, code: room.code };
  },
});

// ---------- Synchronized media state ----------

export const getMedia = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;
    return {
      currentVideoId: room.currentVideoId,
      mediaType: room.mediaType ?? "youtube",
      mediaUrl: room.mediaUrl,
      isPlaying: room.isPlaying,
      positionSec: room.positionSec,
      mediaUpdatedAt: room.mediaUpdatedAt,
      mediaUpdatedBy: room.mediaUpdatedBy,
    };
  },
});

export const setMedia = mutation({
  args: {
    roomId: v.id("rooms"),
    videoId: v.string(),
    mediaType: v.optional(mediaTypeValidator),
    mediaUrl: v.optional(v.string()),
    isPlaying: v.boolean(),
    positionSec: v.number(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Oda bulunamadı.");
    await ctx.db.patch(args.roomId, {
      currentVideoId: args.videoId,
      mediaType: args.mediaType ?? "youtube",
      mediaUrl: args.mediaUrl,
      isPlaying: args.isPlaying,
      positionSec: Math.max(0, args.positionSec),
      mediaUpdatedAt: Date.now(),
      mediaUpdatedBy: args.sessionId,
    });
  },
});

export const stopMedia = mutation({
  args: { roomId: v.id("rooms"), sessionId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.patch(args.roomId, {
      currentVideoId: undefined,
      mediaType: undefined,
      mediaUrl: undefined,
      isPlaying: false,
      positionSec: 0,
      mediaUpdatedAt: Date.now(),
      mediaUpdatedBy: args.sessionId,
    });
  },
});

// ---------- Queue ----------

export const listQueue = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("queueItems")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("asc")
      .take(100);
  },
});

export const addToQueue = mutation({
  args: {
    roomId: v.id("rooms"),
    videoId: v.string(),
    mediaType: v.optional(mediaTypeValidator),
    mediaUrl: v.optional(v.string()),
    title: v.string(),
    thumb: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    const itemId = await ctx.db.insert("queueItems", {
      roomId: args.roomId,
      videoId: args.videoId,
      mediaType: args.mediaType ?? "youtube",
      mediaUrl: args.mediaUrl,
      title: args.title.slice(0, 140),
      thumb: args.thumb,
      addedByName: user?.name ?? "Misafir",
      createdAt: Date.now(),
      played: false,
    });
    // If nothing is playing, start it right away.
    const room = await ctx.db.get(args.roomId);
    if (room && !room.currentVideoId) {
      await ctx.db.patch(args.roomId, {
        currentVideoId: args.videoId,
        mediaType: args.mediaType ?? "youtube",
        mediaUrl: args.mediaUrl,
        isPlaying: true,
        positionSec: 0,
        mediaUpdatedAt: Date.now(),
        mediaUpdatedBy: "queue",
      });
      await ctx.db.patch(itemId, { played: true });
    }
    return itemId;
  },
});

export const removeQueueItem = mutation({
  args: { itemId: v.id("queueItems") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    await ctx.db.delete(args.itemId);
  },
});

export const playQueueItem = mutation({
  args: { itemId: v.id("queueItems"), sessionId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) return;
    await ctx.db.patch(item.roomId, {
      currentVideoId: item.videoId,
      mediaType: item.mediaType ?? "youtube",
      mediaUrl: item.mediaUrl,
      isPlaying: true,
      positionSec: 0,
      mediaUpdatedAt: Date.now(),
      mediaUpdatedBy: args.sessionId,
    });
    await ctx.db.patch(args.itemId, { played: true });
  },
});

/** Auto-advance: when a video ends, start the next unplayed queue item. */
export const advanceQueue = mutation({
  args: { roomId: v.id("rooms"), finishedVideoId: v.string() },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.currentVideoId !== args.finishedVideoId) return; // already advanced
    const next = await ctx.db
      .query("queueItems")
      .withIndex("by_room_played", (q) =>
        q.eq("roomId", args.roomId).eq("played", false),
      )
      .order("asc")
      .first();
    if (next) {
      await ctx.db.patch(args.roomId, {
        currentVideoId: next.videoId,
        mediaType: next.mediaType ?? "youtube",
        mediaUrl: next.mediaUrl,
        isPlaying: true,
        positionSec: 0,
        mediaUpdatedAt: Date.now(),
        mediaUpdatedBy: "queue",
      });
      await ctx.db.patch(next._id, { played: true });
    } else {
      await ctx.db.patch(args.roomId, {
        isPlaying: false,
        positionSec: 0,
        mediaUpdatedAt: Date.now(),
        mediaUpdatedBy: "queue",
      });
    }
  },
});
