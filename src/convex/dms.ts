import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// ---------- ÖRDEX social v2: calls, groups, mentions, read receipts ----------
// Extends src/convex/social.ts (friends + basic DMs). The `dms` table carries
// a `readAt` receipt; groups live in `groups` / `groupMembers` /
// `groupMessages`; calls in `calls` with WebRTC relay in `callSignals`.

async function requireUser(ctx: { auth: unknown }) {
  const userId = await getAuthUserId(ctx as never);
  if (userId === null) throw new Error("Giriş yapmalısın.");
  return userId;
}

/**
 * Read-only queries use this instead of requireUser: when the auth token is
 * not attached yet (first paint, token refresh, reconnect) they return safe
 * defaults instead of throwing. A throwing reactive query crashes the whole
 * React tree — the exact "Giriş yapmalısın" preview error.
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

// ================= Typing indicators =================

const TYPING_TTL_MS = 6_000;

/** Broadcast "I'm typing" in a DM/group/room. Ephemeral: rows expire silently. */
export const setTyping = mutation({
  args: {
    scope: v.union(v.literal("dm"), v.literal("group"), v.literal("room")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const user = await ctx.db.get(me);
    const now = Date.now();
    const existing = await ctx.db
      .query("typing")
      .withIndex("by_scope_target", (q) => q.eq("scope", args.scope).eq("targetId", args.targetId))
      .collect()
      .then((rows) => rows.find((r) => r.userId === me));
    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
    } else {
      await ctx.db.insert("typing", {
        scope: args.scope,
        targetId: args.targetId,
        userId: me,
        userName: user?.name ?? "Misafir",
        updatedAt: now,
      });
    }
    // Opportunistic TTL sweep: a typist who closed the tab never stops typing.
    const stale = await ctx.db
      .query("typing")
      .withIndex("by_scope_target", (q) => q.eq("scope", args.scope).eq("targetId", args.targetId))
      .collect();
    for (const row of stale) {
      if (now - row.updatedAt > TYPING_TTL_MS) await ctx.db.delete(row._id);
    }
  },
});

/** Stop the typing indicator (Enter gönderildi / input temizlendi). */
export const clearTyping = mutation({
  args: {
    scope: v.union(v.literal("dm"), v.literal("group"), v.literal("room")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_scope_target", (q) => q.eq("scope", args.scope).eq("targetId", args.targetId))
      .collect();
    for (const row of rows) {
      if (row.userId === me) await ctx.db.delete(row._id);
    }
  },
});

/** Live typing list for a conversation (already TTL-filtered). */
export const listTyping = query({
  args: {
    scope: v.union(v.literal("dm"), v.literal("group"), v.literal("room")),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("typing")
      .withIndex("by_scope_target", (q) => q.eq("scope", args.scope).eq("targetId", args.targetId))
      .collect();
    return rows
      .filter((r) => r.userId !== me && now - r.updatedAt < TYPING_TTL_MS)
      .map((r) => ({ userId: r.userId, userName: r.userName }));
  },
});

/** Resolve @names in a text to user ids (for mention notifications). */
async function resolveMentions(ctx: QueryCtx, text: string): Promise<Id<"users">[] | undefined> {
  const names = new Set<string>();
  for (const m of text.matchAll(/@([\wçğıöşüÇĞİÖŞÜ.]{2,32})/gu)) {
    names.add(m[1].toLowerCase());
  }
  if (names.size === 0) return undefined;
  const users = await ctx.db.query("users").collect();
  const ids = users
    .filter((u) => {
      const handle = (u.username ?? u.name ?? "").toLowerCase();
      return names.has(handle);
    })
    .map((u) => u._id);
  return ids.length > 0 ? ids : undefined;
}

// ================= DM read receipts + unread counters =================

/** DM history between me and a peer, with read receipt state. */
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
    const rows = [...sent, ...received]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((d) => ({
        ...d,
        mine: d.senderId === me,
        // ✔ sent (exists) / ✔✔ read (recipient opened after it was created)
        read: d.senderId === me ? d.readAt !== undefined : undefined,
      }));
    // Attach reply previews (single fan-out, bounded to visible history).
    const replyIds = new Set(rows.map((r) => r.replyToId).filter((id): id is Id<"dms"> => Boolean(id)));
    const replyMap = new Map<string, { userName: string; text?: string }>();
    for (const id of replyIds) {
      const src = await ctx.db.get(id);
      if (src) replyMap.set(id, { userName: src.senderName ?? "Bilinmeyen", text: src.text });
    }
    return rows.map((r) => ({
      ...r,
      replyTo: r.replyToId ? replyMap.get(r.replyToId) : undefined,
    }));
  },
});

/** Edit one of my own DMs ("düzenlendi" tag). */
export const editDm = mutation({
  args: { messageId: v.id("dms"), text: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== me) throw new Error("Sadece kendi mesajını düzenleyebilirsin.");
    const text = args.text.trim().slice(0, 2000);
    if (!text && !msg.gifUrl) throw new Error("Mesaj boş olamaz.");
    await ctx.db.patch(args.messageId, {
      text: text || undefined,
      editedAt: Date.now(),
    });
  },
});

/** Delete one of my own DMs. */
export const deleteDm = mutation({
  args: { messageId: v.id("dms") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== me) throw new Error("Sadece kendi mesajını silebilirsin.");
    // Cut dangling replies so previews never 404 the UI.
    const children = await ctx.db
      .query("dms")
      .withIndex("by_pair", (q) => q.eq("senderId", msg.senderId).eq("recipientId", msg.recipientId))
      .collect();
    for (const child of children) {
      if (child.replyToId === args.messageId) {
        await ctx.db.patch(child._id, { replyToId: undefined });
      }
    }
    await ctx.db.delete(args.messageId);
  },
});

/**
 * Mark every DM the peer sent me as read ("Görüldü"). Called when I open the
 * conversation and whenever new messages arrive while it is open.
 */
export const markDmsRead = mutation({
  args: { otherUserId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const now = Date.now();
    const unread = await ctx.db
      .query("dms")
      .withIndex("by_pair", (q) => q.eq("senderId", args.otherUserId).eq("recipientId", me))
      .collect();
    let changed = 0;
    for (const d of unread) {
      if (d.readAt === undefined) {
        await ctx.db.patch(d._id, { readAt: now });
        changed++;
      }
    }
    return { changed };
  },
});

/**
 * Unread badge counts for the left panel: one row per peer with unread DMs
 * and, when the current room is known, unread room messages + mentions.
 */
export const listUnread = query({
  args: { currentRoomId: v.optional(v.id("rooms")) },
  handler: async (ctx, args) => {
    const me = await currentUserId(ctx);
    if (me === null) return { dms: [], groups: [], roomUnread: 0, roomMentions: 0 };
    const incoming = await ctx.db
      .query("dms")
      .withIndex("by_recipient", (q) => q.eq("recipientId", me))
      .collect();
    const byPeer = new Map<string, { count: number; latest: number }>();
    for (const d of incoming) {
      if (d.readAt !== undefined) continue;
      const entry = byPeer.get(d.senderId) ?? { count: 0, latest: 0 };
      entry.count += 1;
      entry.latest = Math.max(entry.latest, d.createdAt);
      byPeer.set(d.senderId, entry);
    }

    // Room unread: compare latest message time against my read cursor.
    let roomUnread = 0;
    let roomMentions = 0;
    if (args.currentRoomId) {
      const cursor = await ctx.db
        .query("roomReads")
        .withIndex("by_user_room", (q) => q.eq("userId", me).eq("roomId", args.currentRoomId!))
        .unique();
      const since = cursor?.lastReadAt ?? 0;
      const recent = await ctx.db
        .query("messages")
        .withIndex("by_room", (q) => q.eq("roomId", args.currentRoomId!))
        .order("desc")
        .take(100);
      for (const m of recent) {
        if (m.userId === me || m.createdAt <= since) continue;
        roomUnread += 1;
        if (m.mentionedUserIds?.some((id) => id === me)) roomMentions += 1;
      }
    }

    // Group unread: messages where I'm not in readBy yet.
    const myGroups = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    const groupCounts = await Promise.all(
      myGroups.slice(0, 25).map(async (m) => {
        const recent = await ctx.db
          .query("groupMessages")
          .withIndex("by_group", (q) => q.eq("groupId", m.groupId))
          .order("desc")
          .take(50);
        let count = 0;
        let mentions = 0;
        for (const msg of recent) {
          if (msg.senderId === me || msg.readBy.some((id) => id === me)) continue;
          count += 1;
          if (msg.mentionedUserIds?.some((id) => id === me)) mentions += 1;
        }
        return { groupId: m.groupId, count, mentions };
      }),
    );

    return {
      dms: [...byPeer.entries()].map(([peerId, v]) => ({
        peerId: peerId as Id<"users">,
        count: v.count,
        latest: v.latest,
      })),
      groups: groupCounts.filter((g) => g.count > 0),
      roomUnread,
      roomMentions,
    };
  },
});

/**
 * Per-room unread counts for the room lists: latest message time is compared
 * against the user's `roomReads` cursor. Bounded to the 25 most recent rooms.
 */
export const listRoomUnread = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const memberships = await ctx.db
      .query("memberships")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    const rooms = memberships
      .sort((a, b) => b.joinedAt - a.joinedAt)
      .slice(0, 25);
    const counts = await Promise.all(
      rooms.map(async (m) => {
        const cursor = await ctx.db
          .query("roomReads")
          .withIndex("by_user_room", (q) => q.eq("userId", me).eq("roomId", m.roomId))
          .unique();
        const since = cursor?.lastReadAt ?? 0;
        const recent = await ctx.db
          .query("messages")
          .withIndex("by_room", (q) => q.eq("roomId", m.roomId))
          .order("desc")
          .take(50);
        let count = 0;
        let mentions = 0;
        for (const msg of recent) {
          if (msg.userId === me || msg.createdAt <= since) continue;
          count += 1;
          if (msg.mentionedUserIds?.some((id) => id === me)) mentions += 1;
        }
        return { roomId: m.roomId, count, mentions };
      }),
    );
    return counts.filter((c) => c.count > 0);
  },
});

/** Mark the current room as read up to now (clears its badge). */
export const markRoomRead = mutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const existing = await ctx.db
      .query("roomReads")
      .withIndex("by_user_room", (q) => q.eq("userId", me).eq("roomId", args.roomId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastReadAt: Date.now() });
    } else {
      await ctx.db.insert("roomReads", {
        roomId: args.roomId,
        userId: me,
        lastReadAt: Date.now(),
      });
    }
  },
});

// ================= 1:1 voice calls =================

/**
 * Start a call: creates the ringing row. The callee picks it up reactively
 * and hears the ringtone until they accept / reject / it times out.
 */
export const startCall = mutation({
  args: { calleeId: v.id("users"), callerSession: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (me === args.calleeId) throw new Error("Kendini arayamazsın.");
    // Only one live call per caller.
    const live = await ctx.db
      .query("calls")
      .withIndex("by_caller", (q) => q.eq("callerId", me))
      .collect();
    for (const c of live) {
      if (c.status === "ringing" || c.status === "active") {
        await ctx.db.patch(c._id, { status: "ended", endedAt: Date.now() });
      }
    }
    const callId = await ctx.db.insert("calls", {
      callerId: me,
      calleeId: args.calleeId,
      status: "ringing",
      callerSession: args.callerSession,
      createdAt: Date.now(),
    });
    return { callId };
  },
});

/** Callee accepted: both sides switch from ringtone to the WebRTC handshake. */
export const acceptCall = mutation({
  args: { callId: v.id("calls"), calleeSession: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const call = await ctx.db.get(args.callId);
    if (!call || call.calleeId !== me) throw new Error("Arama bulunamadı.");
    if (call.status !== "ringing") return { ok: false };
    await ctx.db.patch(args.callId, {
      status: "active",
      calleeSession: args.calleeSession,
    });
    return { ok: true };
  },
});

/** Reject (callee) or hang up / cancel (either side). */
export const endCall = mutation({
  args: { callId: v.id("calls"), outcome: v.optional(v.union(v.literal("rejected"), v.literal("ended"), v.literal("missed"))) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const call = await ctx.db.get(args.callId);
    if (!call || (call.callerId !== me && call.calleeId !== me)) return;
    if (call.status === "ended" || call.status === "rejected") return;
    await ctx.db.patch(args.callId, {
      status: args.outcome ?? "ended",
      endedAt: Date.now(),
    });
  },
});

/** Ringing call for me (reactive — drives the incoming-call popup + ringtone). */
export const myIncomingCall = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return null;
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_callee", (q) => q.eq("calleeId", me))
      .order("desc")
      .take(5);
    const ringing = rows.find((c) => c.status === "ringing" && Date.now() - c.createdAt < 45_000);
    if (!ringing) return null;
    const caller = await publicUser(ctx, ringing.callerId);
    return {
      callId: ringing._id,
      peerName: caller.name,
      peerAvatar: caller.avatarUrl,
      peerStatus: caller.statusMessage,
      callerSession: ringing.callerSession,
      createdAt: ringing.createdAt,
    };
  },
});

/** The call I am currently in (caller side) — reactive status mirror. */
export const myActiveCall = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return null;
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_caller", (q) => q.eq("callerId", me))
      .order("desc")
      .take(5);
    // Any non-terminated call counts as live: the 120s window used here
    // before force-dropped real calls at the 2-minute mark (the client saw
    // both mirrors go null and hung up mid-conversation).
    const live = rows.find((c) => c.status === "ringing" || c.status === "active");
    if (!live) return null;
    return {
      _id: live._id,
      status: live.status,
      peer: await publicUser(ctx, live.calleeId),
      callerSession: live.callerSession,
      calleeSession: live.calleeSession,
    };
  },
});

/** Call I am in as callee and currently active (for the in-call bar). */
export const myActiveCalleeCall = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return null;
    const rows = await ctx.db
      .query("calls")
      .withIndex("by_callee", (q) => q.eq("calleeId", me))
      .order("desc")
      .take(5);
    // Same fix as myActiveCall: no artificial age cutoff for live calls.
    const live = rows.find((c) => c.status === "active");
    if (!live) return null;
    return {
      _id: live._id,
      status: live.status,
      peer: await publicUser(ctx, live.callerId),
      callerSession: live.callerSession,
      calleeSession: live.calleeSession,
    };
  },
});

// ---- Call signaling relay (same pattern as room rtc.ts, call-scoped) ----

export const sendCallSignal = mutation({
  args: {
    callId: v.id("calls"),
    fromSession: v.string(),
    toSession: v.string(),
    kind: v.union(v.literal("offer"), v.literal("answer"), v.literal("ice")),
    payload: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Giriş yapmalısın.");
    const call = await ctx.db.get(args.callId);
    if (!call || call.status !== "active") return; // call over — drop stragglers
    await ctx.db.insert("callSignals", { ...args, createdAt: Date.now() });
  },
});

export const listCallSignals = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await currentUserId(ctx);
    if (userId === null) return []; // unauthenticated: empty list, not a crash
    return await ctx.db
      .query("callSignals")
      .withIndex("by_to", (q) => q.eq("toSession", args.sessionId))
      .order("asc")
      .take(100);
  },
});

export const deleteCallSignal = mutation({
  args: { signalId: v.id("callSignals") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.signalId);
  },
});

// ================= Group chats =================

/** Groups I am a member of, with the latest message preview per group. */
export const listMyGroups = query({
  args: {},
  handler: async (ctx) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    const memberships = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect();
    return await Promise.all(
      memberships.map(async (m) => {
        const group = await ctx.db.get(m.groupId);
        if (!group) return null;
        const latest = await ctx.db
          .query("groupMessages")
          .withIndex("by_group", (q) => q.eq("groupId", m.groupId))
          .order("desc")
          .take(1);
        return {
          _id: group._id,
          name: group.name,
          createdByUserId: group.createdByUserId,
          lastMessageAt: latest[0]?.createdAt ?? group.createdAt,
        };
      }),
    ).then((rows) => rows.filter((r): r is NonNullable<typeof r> => r !== null));
  },
});

/** Create a group with me + the picked members. */
export const createGroup = mutation({
  args: { name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const name = args.name.trim().slice(0, 60) || "Yeni Grup";
    const groupId = await ctx.db.insert("groups", {
      name,
      createdByUserId: me,
      createdAt: Date.now(),
    });
    const unique = [...new Set([me, ...args.memberIds])];
    const now = Date.now();
    for (const userId of unique) {
      await ctx.db.insert("groupMembers", { groupId, userId, joinedAt: now });
    }
    return { groupId };
  },
});

/** Rename a group (any member can). */
export const renameGroup = mutation({
  args: { groupId: v.id("groups"), name: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const member = await isMember(ctx, args.groupId, me);
    if (!member) throw new Error("Bu grubun üyesi değilsin.");
    const name = args.name.trim().slice(0, 60);
    if (!name) throw new Error("Grup adı boş olamaz.");
    await ctx.db.patch(args.groupId, { name });
  },
});

/** Leave a group; deletes it entirely when the last member leaves. */
export const leaveGroup = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const membership = await ctx.db
      .query("groupMembers")
      .withIndex("by_user", (q) => q.eq("userId", me))
      .collect()
      .then((rows) => rows.find((r) => r.groupId === args.groupId));
    if (!membership) return;
    await ctx.db.delete(membership._id);
    const remaining = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .take(1);
    if (remaining.length === 0) {
      // Last member left: purge the group and its messages.
      const msgs = await ctx.db
        .query("groupMessages")
        .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
        .collect();
      for (const m of msgs) await ctx.db.delete(m._id);
      await ctx.db.delete(args.groupId);
    }
  },
});

/** Group metadata + members (rich user objects). */
export const getGroup = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const me = await currentUserId(ctx);
    if (me === null) return null;
    if (!(await isMember(ctx, args.groupId, me))) return null;
    const group = await ctx.db.get(args.groupId);
    if (!group) return null;
    const members = await ctx.db
      .query("groupMembers")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .collect();
    return {
      _id: group._id,
      name: group.name,
      createdByUserId: group.createdByUserId,
      members: await Promise.all(members.map((m) => publicUser(ctx, m.userId))),
    };
  },
});


/** Send a group message (text/GIF/reply) with @mention resolution. */
export const sendGroupMessage = mutation({
  args: {
    groupId: v.id("groups"),
    text: v.optional(v.string()),
    gifUrl: v.optional(v.string()),
    gifThumb: v.optional(v.string()),
    replyToId: v.optional(v.id("groupMessages")),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await isMember(ctx, args.groupId, me))) throw new Error("Grup üyesi değilsin.");
    const user = await ctx.db.get(me);
    const text = args.text?.trim().slice(0, 2000);
    if (!text && !args.gifUrl) throw new Error("Mesaj boş.");
    let replyToId: Id<"groupMessages"> | undefined;
    if (args.replyToId) {
      const src = await ctx.db.get(args.replyToId);
      if (src && src.groupId === args.groupId) replyToId = args.replyToId;
    }
    await ctx.db.insert("groupMessages", {
      groupId: args.groupId,
      senderId: me,
      userName: user?.name ?? "Misafir",
      text: text || undefined,
      gifUrl: args.gifUrl,
      gifThumb: args.gifThumb,
      replyToId,
      mentionedUserIds: text ? await resolveMentions(ctx, text) : undefined,
      readBy: [me],
      createdAt: Date.now(),
    });
  },
});

/** Edit one of my own group messages ("düzenlendi" tag). */
export const editGroupMessage = mutation({
  args: { messageId: v.id("groupMessages"), text: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== me) throw new Error("Sadece kendi mesajını düzenleyebilirsin.");
    const text = args.text.trim().slice(0, 2000);
    if (!text && !msg.gifUrl) throw new Error("Mesaj boş olamaz.");
    await ctx.db.patch(args.messageId, {
      text: text || undefined,
      editedAt: Date.now(),
      mentionedUserIds: text ? await resolveMentions(ctx, text) : undefined,
    });
  },
});

/** Delete one of my own group messages. */
export const deleteGroupMessage = mutation({
  args: { messageId: v.id("groupMessages") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const msg = await ctx.db.get(args.messageId);
    if (!msg || msg.senderId !== me) throw new Error("Sadece kendi mesajını silebilirsin.");
    const children = await ctx.db
      .query("groupMessages")
      .withIndex("by_group", (q) => q.eq("groupId", msg.groupId))
      .collect();
    for (const child of children) {
      if (child.replyToId === args.messageId) {
        await ctx.db.patch(child._id, { replyToId: undefined });
      }
    }
    await ctx.db.delete(args.messageId);
  },
});

/** Group message history with per-message read receipts (relative to me). */
export const listGroupMessages = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const me = await currentUserId(ctx);
    if (me === null) return [];
    if (!(await isMember(ctx, args.groupId, me))) return [];
    const rows = await ctx.db
      .query("groupMessages")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(100);
    const ordered = rows.reverse();
    // Reply previews in one bounded fan-out.
    const replyIds = new Set(
      ordered.map((r) => r.replyToId).filter((id): id is Id<"groupMessages"> => Boolean(id)),
    );
    const replyMap = new Map<string, { userName: string; text?: string }>();
    for (const id of replyIds) {
      const src = await ctx.db.get(id);
      if (src) replyMap.set(id, { userName: src.userName, text: src.text });
    }
    return ordered.map((m) => ({
      ...m,
      mine: m.senderId === me,
      // ✔✔ for my messages once another member has read them.
      readByAll:
        m.senderId === me ? m.readBy.some((id) => id !== me) : undefined,
      replyTo: m.replyToId ? replyMap.get(m.replyToId) : undefined,
    }));
  },
});

/**
 * Mark group messages as read: adds me to `readBy` of every message I have
 * not read yet. Powers both Görüldü ticks and the group unread badge.
 */
export const markGroupRead = mutation({
  args: { groupId: v.id("groups") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    if (!(await isMember(ctx, args.groupId, me))) return { changed: 0 };
    const unread = await ctx.db
      .query("groupMessages")
      .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
      .order("desc")
      .take(100);
    let changed = 0;
    for (const m of unread.reverse()) {
      if (m.senderId === me || m.readBy.some((id) => id === me)) continue;
      await ctx.db.patch(m._id, { readBy: [...m.readBy, me] });
      changed++;
    }
    return { changed };
  },
});

async function isMember(ctx: QueryCtx, groupId: Id<"groups">, userId: Id<"users">) {
  const rows = await ctx.db
    .query("groupMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.some((r) => r.groupId === groupId);
}

// Back-compat: ChatPanel's send path resolves mentions for room messages.
export const resolveMentionNames = query({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const ids = await resolveMentions(ctx, args.text);
    return ids ?? [];
  },
});
