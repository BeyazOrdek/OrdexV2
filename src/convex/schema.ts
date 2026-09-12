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
      // Rich profile customization
      username: v.optional(v.string()), // unique lowercase handle (Guest_#### for guests)
      bannerColor: v.optional(v.string()), // profile card banner (any CSS color)
      bannerUrl: v.optional(v.string()), // profile card banner image url
      nameColor: v.optional(v.string()), // chat name color (any CSS color)
      badges: v.optional(v.array(v.string())), // profile badges ("founder", "vip", "premium", ...)
    })
      .index("email", ["email"]) // index for the email. do not remove or modify
      .index("by_username", ["username"]), // unique handle lookups (guest IDs, friend adds)

    // add other tables here

    rooms: defineTable({
      code: v.string(),
      name: v.string(),
      createdByUserId: v.id("users"),
      createdByName: v.string(),
      createdAt: v.number(),
      // "public" (default for legacy rows) filtering, join by code/link only when "secret"
      visibility: v.optional(v.union(v.literal("public"), v.literal("secret"))),
      // Room type: cinema (synced YouTube/MP4 watch-together) or gaming (screen share)
      roomType: v.optional(v.union(v.literal("cinema"), v.literal("gaming"))),
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
      // @mention targets resolved at send time (user ids)
      mentionedUserIds: v.optional(v.array(v.id("users"))),
      createdAt: v.number(),
    }).index("by_room", ["roomId"]),

    // Per-user room read cursor — powers unread badges in the room list and
    // the browser tab title counter.
    roomReads: defineTable({
      roomId: v.id("rooms"),
      userId: v.id("users"),
      lastReadAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_room", ["userId", "roomId"]),

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
      isSharing: v.optional(v.boolean()), // screen/game broadcast flag (gaming rooms)
      joinedAt: v.number(),
      lastSeen: v.number(),
    })
      .index("by_room", ["roomId"])
      .index("by_session", ["sessionId"])
      .index("by_user", ["userId"]),

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
      senderName: v.optional(v.string()),
      text: v.optional(v.string()),
      gifUrl: v.optional(v.string()),
      gifThumb: v.optional(v.string()),
      // Read receipt: set when the recipient opens the conversation.
      readAt: v.optional(v.number()),
      createdAt: v.number(),
      // Discord-style reply: id of the DM this message quotes.
      replyToId: v.optional(v.id("dms")),
      // "düzenlendi" tag timestamp (undefined = never edited).
      editedAt: v.optional(v.number()),
    })
      .index("by_pair", ["senderId", "recipientId"])
      .index("by_recipient", ["recipientId"]),

    // 1:1 voice calls (WebRTC signaling rides on callSignals below).
    calls: defineTable({
      callerId: v.id("users"),
      calleeId: v.id("users"),
      status: v.union(
        v.literal("ringing"),
        v.literal("active"),
        v.literal("ended"),
        v.literal("rejected"),
        v.literal("missed"),
      ),
      callerSession: v.string(),
      calleeSession: v.optional(v.string()),
      createdAt: v.number(),
      endedAt: v.optional(v.number()),
    })
      .index("by_caller", ["callerId"])
      .index("by_callee", ["calleeId"]),

    // WebRTC relay for calls (same shape as room `signals`, but call-scoped).
    callSignals: defineTable({
      callId: v.id("calls"),
      fromSession: v.string(),
      toSession: v.string(),
      kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
      payload: v.string(),
      createdAt: v.number(),
    })
      .index("by_to", ["toSession"])
      .index("by_call", ["callId"]),

    // Group chats
    groups: defineTable({
      name: v.string(),
      createdByUserId: v.id("users"),
      createdAt: v.number(),
    }),

    groupMembers: defineTable({
      groupId: v.id("groups"),
      userId: v.id("users"),
      joinedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_group", ["groupId"]),

    groupMessages: defineTable({
      groupId: v.id("groups"),
      senderId: v.id("users"),
      userName: v.string(),
      text: v.optional(v.string()),
      gifUrl: v.optional(v.string()),
      gifThumb: v.optional(v.string()),
      mentionedUserIds: v.optional(v.array(v.id("users"))),
      // Read receipts: member ids that opened the group after this message.
      readBy: v.array(v.id("users")),
      createdAt: v.number(),
      replyToId: v.optional(v.id("groupMessages")),
      editedAt: v.optional(v.number()),
    }).index("by_group", ["groupId"]),

    // Typing indicators (ephemeral rows, TTL-swept by the writer).
    typing: defineTable({
      scope: v.union(
        v.literal("dm"),
        v.literal("group"),
        v.literal("room"),
      ),
      // dm → peer user id, group → group id, room → room id.
      targetId: v.string(),
      userId: v.id("users"),
      userName: v.string(),
      updatedAt: v.number(),
    })
      .index("by_scope_target", ["scope", "targetId"])
      .index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
