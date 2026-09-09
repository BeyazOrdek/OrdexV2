import { api } from "@/convex/_generated/api";
import { useMutation, useQuery, useAction } from "convex/react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleDot,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Search,
  Send,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils-room";

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

  const sendRequest = useMutation(api.social.sendFriendRequest);
  const acceptRequest = useMutation(api.social.acceptFriendRequest);
  const removeFriend = useMutation(api.social.removeFriend);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [dmWith, setDmWith] = useState<PublicUserLite | null>(null);

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

  if (dmWith) {
    return <DmView peer={dmWith} onBack={() => setDmWith(null)} />;
  }

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
                onClick={() => setDmWith(u)}
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
                <span className="shrink-0 text-[10px] text-zinc-600">
                  {new Date(u.lastAt).toLocaleDateString("tr-TR", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </button>
            ))}
          </>
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
              size="sm"
              variant="secondary"
              className="h-7 shrink-0 gap-1 bg-white/10 px-2 text-[11px] text-zinc-100 hover:bg-white/15"
              onClick={() => setDmWith(u)}
            >
              <MessageSquare className="size-3" /> DM
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DmView({ peer, onBack }: { peer: PublicUserLite; onBack: () => void }) {
  const messages = useQuery(api.social.listDms, { otherUserId: peer._id as never }) ?? [];
  const sendDm = useMutation(api.social.sendDm);
  const searchGifs = useAction(api.tenor.searchGifs);

  const [text, setText] = useState("");
  const [showGifs, setShowGifs] = useState(false);
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string; desc: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const loadGifs = async (q: string) => {
    setGifLoading(true);
    setGifError(null);
    try {
      const result = await searchGifs({ query: q });
      setGifs(result.gifs);
      if (result.error) setGifError(result.error);
    } catch {
      setGifError("GIF'ler yüklenemedi.");
    } finally {
      setGifLoading(false);
    }
  };

  const send = (gif?: { url: string; preview: string }) => {
    const clean = text.trim();
    if (!clean && !gif) return;
    setText("");
    void sendDm({
      recipientId: peer._id as never,
      text: clean || undefined,
      gifUrl: gif?.url,
      gifThumb: gif?.preview,
    }).catch(() => undefined);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 p-3">
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-zinc-400 hover:bg-white/10"
          onClick={onBack}
          title="Geri"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <UserAvatar user={peer} size={7} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-zinc-100">{peer.name}</p>
          {peer.statusMessage && (
            <p className="truncate text-[10px] text-zinc-600">{peer.statusMessage}</p>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-zinc-600">
            {peer.name} ile sohbetin burada başlar.
          </p>
        )}
        {messages.map((m) => (
          <div key={m._id} className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-xl px-2.5 py-1.5",
                m.mine
                  ? "bg-[var(--ordex-accent-soft)] text-[var(--ordex-text)]"
                  : "bg-black/30 text-zinc-300",
              )}
            >
              {m.text && <p className="whitespace-pre-wrap break-words text-xs">{m.text}</p>}
              {m.gifUrl && (
                <img src={m.gifThumb ?? m.gifUrl} alt="GIF" className="mt-1 max-h-36 rounded-md" loading="lazy" />
              )}
            </div>
          </div>
        ))}
      </div>

      {showGifs && (
        <div className="border-t border-white/5 bg-black/30 p-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="GIF ara..."
              onKeyDown={(e) => e.key === "Enter" && void loadGifs((e.target as HTMLInputElement).value)}
              className="h-8 border-white/10 bg-black/40 text-xs"
            />
            <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => void loadGifs("")}>
              Ara
            </Button>
            <Button size="icon" variant="ghost" className="size-8 text-zinc-500" onClick={() => setShowGifs(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-2 grid max-h-32 grid-cols-3 gap-1.5 overflow-y-auto [scrollbar-width:thin]">
            {gifLoading && (
              <div className="col-span-3 flex justify-center py-3">
                <Loader2 className="size-5 animate-spin text-zinc-500" />
              </div>
            )}
            {gifError && <p className="col-span-3 text-[11px] text-amber-400">{gifError}</p>}
            {gifs.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  send({ url: g.url, preview: g.preview });
                  setShowGifs(false);
                }}
                className="overflow-hidden rounded-md border border-transparent hover:border-[var(--ordex-accent)]"
              >
                <img src={g.preview} alt={g.desc} className="h-16 w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-white/5 p-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="GIF gönder"
          onClick={() => {
            setShowGifs((v) => !v);
            if (!showGifs && gifs.length === 0 && !gifLoading) void loadGifs("");
          }}
        >
          <ImageIcon className="size-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={`${peer.name} kullanıcısına mesaj...`}
          className="h-9 border-white/10 bg-black/30 text-xs"
        />
        <Button
          size="icon"
          className="size-8 shrink-0 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
          title="Gönder"
          onClick={() => send()}
          disabled={!text.trim()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
