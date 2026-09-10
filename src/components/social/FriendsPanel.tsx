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
  useUnreadBadges,
} from "@/components/social/SocialOverlay";

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
          className="flex items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[10px] font-bold text-[var(--ordex-accent)]"
          style={px}
        >
          {initials(user.name)}
        </span>
      )}
      {/* Online / offline presence dot */}
      {online !== undefined && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-[var(--ordex-panel-2, #1a1d21)]",
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

export function FriendsPanel() {
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

  const openDm = (u: PublicUserLite) => openSocialView({ kind: "dm", peer: u });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Add friend: live search by username */}
      <div className="border-b border-white/5 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-600" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kullanıcı ara ve arkadaş ekle..."
            className="h-9 border-white/10 bg-black/30 pl-8 text-xs placeholder:text-zinc-600"
          />
        </div>
        {message && <p className="mt-1.5 text-[11px] text-zinc-400">{message}</p>}

        {/* Search results */}
        {search.trim().length >= 2 && (
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto [scrollbar-width:thin]">
            {isSearching && (
              <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-zinc-500">
                <Loader2 className="size-3.5 animate-spin" /> Aranıyor...
              </div>
            )}
            {!isSearching && searchUsers !== undefined && (searchUsers as PublicUserLite[]).length === 0 && (
              <p className="px-1 py-1 text-[11px] text-zinc-600">Kullanıcı bulunamadı.</p>
            )}
            {!isSearching &&
              (searchUsers as PublicUserLite[] | undefined)?.map((u) => (
                <div
                  key={u._id}
                  className="flex items-center gap-2 rounded-md bg-black/20 px-2 py-1.5"
                >
                  <UserAvatar user={u} size={7} />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">
                    {u.name}
                  </span>
                  {friendIds.has(u._id) ? (
                    <span className="flex shrink-0 items-center gap-1 text-[10px] text-emerald-400">
                      <BadgeCheck className="size-3.5" /> Arkadaş
                    </span>
                  ) : incomingIds.has(u._id) ? (
                    <span className="shrink-0 text-[10px] text-amber-400">sana istek attı</span>
                  ) : outgoingIds.has(u._id) ? (
                    <span className="shrink-0 text-[10px] text-zinc-500">bekliyor…</span>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {/* DM contacts */}
        {dmContacts.length > 0 && (
          <>
            <p className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <MessageSquare className="size-3" /> Mesajlar ({dmContacts.length})
            </p>
            {dmContacts.map((u) => (
              <button
                key={u._id}
                onClick={() => openDm(u)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
              >
                <UserAvatar user={u} online={isOnline(u._id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-zinc-200">{u.name}</span>
                  {u.statusMessage && (
                    <span className="block truncate text-[10px] text-zinc-600">
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
        <div className="flex items-center justify-between px-2 pb-1 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <Users className="size-3" /> Gruplar ({groups.length})
          </p>
          <Button
            size="icon"
            variant="ghost"
            className="size-5 text-zinc-500 hover:bg-white/10 hover:text-zinc-100"
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
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
              <Users className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{g.name}</span>
            <CountBadge count={badges.groupByGroup.get(String(g._id)) ?? 0} />
          </button>
        ))}
        {groups.length === 0 && (
          <p className="px-2 py-1 text-xs text-zinc-600">
            Henüz grubun yok. "+" ile arkadaşlarından grup kur.
          </p>
        )}

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <>
            <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Gelen istekler
              <span className="rounded-full bg-[var(--ordex-accent)] px-1.5 text-[9px] font-bold text-white">
                {incoming.length}
              </span>
            </p>
            {incoming.map((u) => (
              <div key={u._id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                <UserAvatar user={u} />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{u.name}</span>
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
                  className="size-6 text-zinc-500 hover:bg-white/10 hover:text-red-400"
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
        {outgoing.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Gönderilen istekler ({outgoing.length})
            </p>
            {outgoing.map((u) => (
              <div key={u._id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
                <UserAvatar user={u} />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{u.name}</span>
                <span className="shrink-0 text-[10px] text-zinc-600">bekliyor…</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 text-zinc-500 hover:bg-white/10 hover:text-red-400"
                  title="İptal et"
                  onClick={() => void removeFriend({ otherUserId: u._id as never })}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </>
        )}

        {/* Friends */}
        <p className="flex items-center gap-1.5 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <CircleDot className="size-3" /> Arkadaşlar ({friends.length})
        </p>
        {friends.length === 0 && (
          <p className="px-2 py-1 text-xs text-zinc-600">
            Henüz arkadaşın yok. Yukarıdan kullanıcı adı ile ara ve istek gönder.
          </p>
        )}
        {friends.map((u) => (
          <div key={u._id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
            <UserAvatar user={u} online={isOnline(u._id)} sharing={isSharing(u._id)} />
            <span className="min-w-0 flex-1">
              <span
                className="block truncate text-xs font-medium"
                style={{ color: u.nameColor ?? (isOnline(u._id) ? "#e7e8ea" : "#71717a") }}
              >
                {u.name}
              </span>
              {u.statusMessage && (
                <span className="block truncate text-[10px] text-zinc-600">{u.statusMessage}</span>
              )}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-zinc-500 opacity-0 transition-opacity hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
              title="Arkadaşlığı bitir"
              onClick={() => void removeFriend({ otherUserId: u._id as never })}
            >
              <UserMinus className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-zinc-500 hover:bg-white/10 hover:text-emerald-400"
              title="Sesli ara"
              onClick={() => openSocialView({ kind: "dm", peer: u })}
            >
              <Phone className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 gap-1 bg-white/10 px-2 text-[11px] text-zinc-100 hover:bg-white/15"
              onClick={() => openDm(u)}
            >
              <MessageSquare className="size-3" /> DM
            </Button>
            <CountBadge count={badges.dmByPeer.get(String(u._id)) ?? 0} />
          </div>
        ))}
      </div>
    </div>
  );
}

