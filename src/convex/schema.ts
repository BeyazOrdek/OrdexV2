import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // ÖRDEX profile extensions
      statusMessage: v.optional(v.string()),
      avatarUrl: v.optional(v.string()), // custom avatar image or Tenor GIF url
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // add other tables here

    rooms: defineTable({
      code: v.string(),
      name: v.string(),
      createdByUserId: v.id("users"),
      createdByName: v.string(),
      createdAt: v.number(),
      // "public" (default for legacy rows) filtering, join by code/link only when "secret"
      visibility: v.optional(v.union(v.literal("public"), v.literal("secret"))),
      // synchronized playback state (YouTube IFrame or direct HTML5 video)
      // currentVideoId is the media key: YouTube video id, or the full URL for direct files
      currentVideoId: v.optional(v.string()),
      mediaType: v.optional(v.union(v.literal("youtube"), v.literal("direct"))),
      mediaUrl: v.optional(v.string()), // direct playback URL (mp4/webm/tau-video)
      isPlaying: v.boolean(),
      positionSec: v.number(),
      mediaUpdatedAt: v.number(),
      mediaUpdatedBy: v.string(), // sessionId of last controller
    }).index("by_code", ["code"]),

    memberships: defineTable({
      roomId: v.id("rooms"),
      userId: v.id("users"),
      joinedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_room_user", ["roomId", "userId"]),

    messages: defineTable({
      roomId: v.id("rooms"),
      userId: v.id("users"),
      userName: v.string(),
      text: v.optional(v.string()),
      gifUrl: v.optional(v.string()),
      gifThumb: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_room", ["roomId"]),

    reactions: defineTable({
      messageId: v.id("messages"),
      roomId: v.id("rooms"),
      emoji: v.string(),
      userId: v.id("users"),
    })
      .index("by_message", ["messageId"])
      .index("by_room", ["roomId"]),

    presence: defineTable({
      roomId: v.id("rooms"),
      sessionId: v.string(),
      userId: v.id("users"),
      userName: v.string(),
      avatarHue: v.number(),
      inVoice: v.boolean(),
      micOn: v.boolean(),
      camOn: v.boolean(),
      joinedAt: v.number(),
      lastSeen: v.number(),
    })
      .index("by_room", ["roomId"])
      .index("by_session", ["sessionId"]),

    // WebRTC signaling relay (offers / answers / ICE candidates)
    signals: defineTable({
      roomId: v.id("rooms"),
      fromSession: v.string(),
      toSession: v.string(),
      kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
      payload: v.string(),
      createdAt: v.number(),
    }).index("by_to", ["toSession"]),

    queueItems: defineTable({
      roomId: v.id("rooms"),
      // media key: YouTube video id, or the full URL for direct files
      videoId: v.string(),
      mediaType: v.optional(v.union(v.literal("youtube"), v.literal("direct"))),
      mediaUrl: v.optional(v.string()),
      title: v.string(),
      thumb: v.optional(v.string()),
      addedByName: v.string(),
      createdAt: v.number(),
      played: v.boolean(),
    })
      .index("by_room", ["roomId"])
      .index("by_room_played", ["roomId", "played"]),

    // tableName: defineTable({
    //   ...
    //   // table fields
    // }).index("by_field", ["field"])

    // ÖRDEX social layer
    friendships: defineTable({
      userId: v.id("users"), // one direction; accepted friendships stored twice (a→b, b→a)
      friendId: v.id("users"),
      status: v.union(v.literal("pending"), v.literal("accepted")),
      requestedBy: v.id("users"),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_pair", ["userId", "friendId"]),

    dms: defineTable({
      senderId: v.id("users"),
      recipientId: v.id("users"),
      text: v.optional(v.string()),
      gifUrl: v.optional(v.string()),
      gifThumb: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_pair", ["senderId", "recipientId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
