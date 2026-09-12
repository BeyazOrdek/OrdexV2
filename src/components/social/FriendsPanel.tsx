import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  BadgeCheck,
  Check,
  CircleDot,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  Search,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils-room";
import {
  CountBadge,
  openCreateGroupModal,
  openSocialView,
  startCallWith,
  ProfileAvatar,
  useUnreadBadges,
} from "@/components/social/SocialOverlay";

/**
 * Discord-style friend sub-views driven by the top navigation bar:
 * - "online": only friends with a fresh presence dot
 * - "all": DM contacts + groups + full friends list
 * - "pending": incoming/outgoing friend requests
 * - "add": username search + request form
 */
export type FriendsView = "online" | "all" | "pending" | "add";

interface PublicUserLite {
  _id: string;
  name: string;
  statusMessage?: string;
  avatarUrl?: string;
  nameColor?: string;
  badges?: string[];
}

function UserAvatar({
  user,
  size = 8,
  online,
  sharing,
}: {
  user: PublicUserLite;
  size?: number;
  online?: boolean;
  sharing?: boolean;
}) {
  const px = { width: `${size * 4}px`, height: `${size * 4}px` };
  return (
    <span className="relative inline-flex shrink-0">
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.name}
          className="rounded-full border border-white/15 object-cover"
          style={px}
        />
      ) : (
        <span
          className="flex items-center justify-center rounded-full bg-[var(--ordex-panel-3)] text-[10px] font-bold text-[var(--ordex-accent)]"
          style={px}
        >
          {initials(user.name)}
        </span>
      )}
      {/* Online / offline presence dot */}
      {online !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--ordex-panel-2)]",
            online ? "bg-emerald-400" : "bg-zinc-600",
          )}
          style={{ width: `${Math.max(7, size * 1.5)}px`, height: `${Math.max(7, size * 1.5)}px` }}
          title={online ? "Çevrimiçi" : "Çevrimdışı"}
        />
      )}
      {sharing && (
        <span
          className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-[var(--ordex-accent)] text-[7px] font-bold text-white"
          title="Ekran yayınında"
        >
          ▶
        </span>
      )}
    </span>
  );
}

// Stable empty arrays: keeps fallback identities constant across renders so
// hooks depending on these lists don't see new references every render.
const EMPTY_USERS: PublicUserLite[] = [];
const EMPTY_DM: (PublicUserLite & { lastAt: number })[] = [];

export function FriendsPanel({ view = "all" }: { view?: FriendsView }) {
  const friends = (useQuery(api.social.listFriends, {}) ?? EMPTY_USERS) as PublicUserLite[];
  const incoming = (useQuery(api.social.listIncomingRequests, {}) ?? EMPTY_USERS) as PublicUserLite[];
  const outgoing = (useQuery(api.social.listOutgoingRequests, {}) ?? EMPTY_USERS) as PublicUserLite[];
  const dmContacts = (useQuery(api.social.listDmContacts, {}) ?? EMPTY_DM) as (PublicUserLite & { lastAt: number })[];

  // Live online/offline status from room presence (reactive).
  const allIds = useMemo(
    () =>
      [...new Set([...friends, ...dmContacts].map((u) => u._id))] as never[],
    [friends, dmContacts],
  );
  const presenceRows = useQuery(
    api.presence.listUsersPresence,
    allIds.length > 0 ? { userIds: allIds } : "skip",
  );
  const onlineMap = useMemo(
    () => new Map((presenceRows ?? []).map((row) => [String(row.userId), row])),
    [presenceRows],
  );
  const isOnline = (userId: string) => onlineMap.get(String(userId))?.online ?? false;
  const isSharing = (userId: string) => onlineMap.get(String(userId))?.isSharing ?? false;

  const groups = useQuery(api.dms.listMyGroups, {}) ?? [];
  const badges = useUnreadBadges();

  const sendRequest = useMutation(api.social.sendFriendRequest);
  const acceptRequest = useMutation(api.social.acceptFriendRequest);
  const removeFriend = useMutation(api.social.removeFriend);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const searchUsers = useQuery(
    api.users.searchUsers,
    search.trim().length >= 2 ? { name: search.trim() } : "skip",
  );

  // Live user search: derive results directly from the reactive Convex query
  // (no effect/state mirror — avoids cascading renders).
  const isSearching = search.trim().length >= 2 && searchUsers === undefined;

  const friendIds = new Set(friends.map((f) => f._id));
  const incomingIds = new Set(incoming.map((u) => u._id));
  const outgoingIds = new Set(outgoing.map((u) => u._id));

  const addById = async (u: PublicUserLite) => {
    setMessage(null);
    try {
      await sendRequest({ userId: u._id as never });
      setMessage(`"${u.name}" kullanıcısına istek gönderildi.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "İstek gönderilemedi.");
    }
  };

  // openSocialView routes automatically: slide-over in rooms, full-screen
  // chat stage on the home page. The phone button always voice-calls.
  const openDm = (u: PublicUserLite) => openSocialView({ kind: "dm", peer: u });

  const onlineFriends = useMemo(() => friends.filter((f) => isOnline(f._id)), [friends, onlineMap]);

  const showSearch = view === "add" || view === "all";
  const showDmContacts = (view === "all" || view === "online") && dmContacts.length > 0;
  const showGroups = view === "all" || view === "online";
  const showRequests = view === "pending" || view === "all";
  const showFriends = view !== "pending" && view !== "add";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Add friend: live search by username */}
      {showSearch && (
        <div className="border-b border-white/5 p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-[var(--ordex-muted)]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                view === "add"
                  ? "Bir kullanıcı adı yaz ve arkadaş ekle..."
                  : "Kullanıcı ara ve arkadaş ekle..."
              }
              className="ordex-inset h-9 border-white/10 pl-8 text-xs text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
          {message && <p className="mt-1.5 text-[11px] text-[var(--ordex-muted)]">{message}</p>}

          {/* Search results */}
          {search.trim().length >= 2 && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto [scrollbar-width:thin]">
              {isSearching && (
                <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-[var(--ordex-muted)]">
                  <Loader2 className="size-3.5 animate-spin" /> Aranıyor...
                </div>
              )}
              {!isSearching && searchUsers !== undefined && (searchUsers as PublicUserLite[]).length === 0 && (
                <p className="px-1 py-1 text-[11px] text-[var(--ordex-muted)]">Kullanıcı bulunamadı.</p>
              )}
              {!isSearching &&
                (searchUsers as PublicUserLite[] | undefined)?.map((u) => (
                  <div
                    key={u._id}
                    className="ordex-inset flex items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <UserAvatar user={u} size={7} />
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-100">
                      {u.name}
                    </span>
                    {friendIds.has(u._id) ? (
                      <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-400">
                        <BadgeCheck className="size-3.5" /> Arkadaş
                      </span>
                    ) : incomingIds.has(u._id) ? (
                      <span className="shrink-0 text-[10px] text-amber-400">sana istek attı</span>
                    ) : outgoingIds.has(u._id) ? (
                      <span className="shrink-0 text-[10px] text-[var(--ordex-muted)]">bekliyor…</span>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 shrink-0 gap-1 bg-[var(--ordex-accent)] px-2 text-[11px] text-white hover:bg-[var(--ordex-accent-hover)]"
                        onClick={() => void addById(u)}
                      >
                        <UserPlus className="size-3" /> Ekle
                      </Button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {/* Online view header */}
        {view === "online" && (
          <p className="flex items-center gap-1.5 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
            <CircleDot className="size-3 text-emerald-400" /> Çevrimiçi — {onlineFriends.length}
          </p>
        )}

        {/* DM contacts */}
        {showDmContacts && (
          <>
            <p className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
              <MessageSquare className="size-3" /> Mesajlar ({dmContacts.length})
            </p>
            {dmContacts.map((u) => (
              <button
                key={u._id}
                onClick={() => openDm(u)}
                className="ordex-inset mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--ordex-panel-3)]"
              >
                <ProfileAvatar user={u} size={8} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-zinc-100">{u.name}</span>
                  {u.statusMessage && (
                    <span className="block truncate text-[10px] text-[var(--ordex-muted)]">
                      {u.statusMessage}
                    </span>
                  )}
                </span>
                <CountBadge count={badges.dmByPeer.get(String(u._id)) ?? 0} />
              </button>
            ))}
          </>
        )}

        {/* Groups */}
        {showGroups && (
          <>
            <div className="flex items-center justify-between px-2 pb-1 pt-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
                <Users className="size-3" /> Gruplar ({groups.length})
              </p>
              <Button
                size="icon"
                variant="ghost"
                className="size-5 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
                title="Grup oluştur"
                onClick={openCreateGroupModal}
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            {groups.map((g) => (
              <button
                key={g._id}
                onClick={() => openSocialView({ kind: "group", groupId: g._id })}
                className="ordex-inset mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--ordex-panel-3)]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
                  <Users className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-100">{g.name}</span>
                <CountBadge count={badges.groupByGroup.get(String(g._id)) ?? 0} />
              </button>
            ))}
            {groups.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
                Henüz grubun yok. "+" ile arkadaşlarından grup kur.
              </p>
            )}
          </>
        )}

        {/* Incoming requests */}
        {showRequests && incoming.length > 0 && (
          <>
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
              Gelen istekler
              <span className="rounded-full bg-[var(--ordex-accent)] px-1.5 text-[9px] font-bold text-white">
                {incoming.length}
              </span>
            </p>
            {incoming.map((u) => (
              <div key={u._id} className="ordex-inset mb-1 flex items-center gap-2 rounded-md px-2 py-1.5">
                <UserAvatar user={u} />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-100">{u.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-emerald-400 hover:bg-emerald-500/15"
                  title="Kabul et"
                  onClick={() => void acceptRequest({ requesterId: u._id as never })}
                >
                  <Check className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-red-400"
                  title="Reddet"
                  onClick={() => void removeFriend({ otherUserId: u._id as never })}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </>
        )}

        {/* Outgoing requests */}
        {showRequests && outgoing.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
              Gönderilen istekler ({outgoing.length})
            </p>
            {outgoing.map((u) => (
              <div key={u._id} className="ordex-inset mb-1 flex items-center gap-2 rounded-md px-2 py-1.5">
                <UserAvatar user={u} />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{u.name}</span>
                <span className="shrink-0 text-[10px] text-[var(--ordex-muted)]">bekliyor…</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-red-400"
                  title="İptal et"
                  onClick={() => void removeFriend({ otherUserId: u._id as never })}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </>
        )}
        {view === "pending" && incoming.length === 0 && outgoing.length === 0 && (
          <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">Bekleyen istek yok.</p>
        )}

        {/* Friends */}
        {showFriends && (
          <>
            {view !== "online" && (
              <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
                <CircleDot className="size-3" /> Arkadaşlar ({friends.length})
              </p>
            )}
            {view === "all" && friends.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
                Henüz arkadaşın yok. Yukarıdan kullanıcı adı ile ara ve istek gönder.
              </p>
            )}
            {view === "online" && onlineFriends.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
                Şu anda çevrimiçi arkadaşın yok.
              </p>
            )}
            {(view === "online" ? onlineFriends : friends).map((u) => (
              <div key={u._id} className="ordex-inset group mb-1 flex items-center gap-2 rounded-md px-2 py-1.5">
                <ProfileAvatar user={u} size={8} />
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-xs font-medium"
                    style={{ color: u.nameColor ?? (isOnline(u._id) ? "#e7e8ea" : "var(--ordex-muted)") }}
                  >
                    {u.name}
                  </span>
                  {u.statusMessage && (
                    <span className="block truncate text-[10px] text-[var(--ordex-muted)]">{u.statusMessage}</span>
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-[var(--ordex-muted)] opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                  title="Arkadaşlığı bitir"
                  onClick={() => void removeFriend({ otherUserId: u._id as never })}
                >
                  <UserMinus className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-emerald-400"
                  title="Sesli ara"
                  onClick={() => startCallWith(u._id, u.name, u.avatarUrl)}
                >
                  <Phone className="size-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="ordex-chip h-7 shrink-0 gap-1 border border-white/10 px-2 text-[11px] hover:bg-[var(--ordex-accent)] hover:text-white"
                  onClick={() => openDm(u)}
                >
                  <MessageSquare className="size-3" /> DM
                </Button>
                <CountBadge count={badges.dmByPeer.get(String(u._id)) ?? 0} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
