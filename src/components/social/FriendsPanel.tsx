import { api } from "@/convex/_generated/api";
import { useMutation, useQuery, useAction } from "convex/react";
import {
  ArrowLeft,
  Check,
  Image as ImageIcon,
  Loader2,
  Search,
  Send,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils-room";

interface PublicUserLite {
  _id: string;
  name: string;
  statusMessage?: string;
  avatarUrl?: string;
}

function UserAvatar({ user, size = 8 }: { user: PublicUserLite; size?: number }) {
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        className="shrink-0 rounded-full border border-white/15 object-cover"
        style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
      />
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[10px] font-bold text-[var(--ordex-accent)]"
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    >
      {initials(user.name)}
    </span>
  );
}

export function FriendsPanel() {
  const friends = (useQuery(api.social.listFriends, {}) ?? []) as PublicUserLite[];
  const incoming = (useQuery(api.social.listIncomingRequests, {}) ?? []) as PublicUserLite[];
  const outgoing = (useQuery(api.social.listOutgoingRequests, {}) ?? []) as PublicUserLite[];

  const sendRequest = useMutation(api.social.sendFriendRequest);
  const acceptRequest = useMutation(api.social.acceptFriendRequest);
  const removeFriend = useMutation(api.social.removeFriend);

  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [dmWith, setDmWith] = useState<PublicUserLite | null>(null);

  const addByName = async () => {
    const clean = search.trim();
    if (!clean) return;
    setMessage(null);
    try {
      await sendRequest({ name: clean });
      setMessage(`"${clean}" kullanıcısına istek gönderildi.`);
      setSearch("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "İstek gönderilemedi.");
    }
  };

  if (dmWith) {
    return <DmView peer={dmWith} onBack={() => setDmWith(null)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Add friend */}
      <div className="border-b border-white/5 p-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-600" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addByName()}
              placeholder="Kullanıcı adıyla arkadaş ekle..."
              className="h-9 border-white/10 bg-black/30 pl-8 text-xs placeholder:text-zinc-600"
            />
          </div>
          <Button
            size="sm"
            onClick={() => void addByName()}
            disabled={!search.trim()}
            className="h-9 shrink-0 gap-1 bg-[var(--ordex-accent)] px-3 text-xs text-white hover:bg-[var(--ordex-accent-hover)]"
          >
            <UserPlus className="size-3.5" /> Ekle
          </Button>
        </div>
        {message && <p className="mt-1.5 text-[11px] text-zinc-400">{message}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
        {/* Incoming requests */}
        {incoming.length > 0 && (
          <>
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Gelen istekler ({incoming.length})
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
        <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Arkadaşlar ({friends.length})
        </p>
        {friends.length === 0 && incoming.length === 0 && outgoing.length === 0 && (
          <p className="px-2 py-1 text-xs text-zinc-600">
            Henüz arkadaşın yok. Yukarıdan kullanıcı adı ile istek gönder.
          </p>
        )}
        {friends.map((u) => (
          <div key={u._id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5">
            <UserAvatar user={u} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-zinc-200">{u.name}</span>
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
              className="h-7 shrink-0 bg-white/10 px-2 text-[11px] text-zinc-100 hover:bg-white/15"
              onClick={() => setDmWith(u)}
            >
              DM
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
