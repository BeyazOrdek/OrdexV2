import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { useAction, useMutation, useQuery } from "convex/react";
import { Image as ImageIcon, Loader2, MessageSquare, Search, Send, SmilePlus, UserPlus, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { badgeMeta } from "@/lib/profile";
import { UserProfileCard, MentionText, openSocialView } from "@/components/social/SocialOverlay";
import { renderFormattedMessage, splitHighlight } from "@/lib/format-message";
import { Lightbox } from "@/components/Lightbox";
import { Pin, PinOff } from "lucide-react";

const QUICK_EMOJIS = ["👍", "😂", "❤️", "🔥", "😮", "😢", "🎉", "👀"];

interface ChatMessage {
  _id: string;
  userId: string;
  userName: string;
  text?: string;
  gifUrl?: string;
  gifThumb?: string;
  pinned?: boolean;
  createdAt: number;
}
// (docs) `pinned` artık şemada tanımlı: messages.pinned / dms.pinned / groupMessages.pinned

/** 🔍 Renders text with every query match wrapped in a yellow highlight + 💬 inline formatting. */
function HighlightText({ text, query, selfName }: { text: string; query: string; selfName?: string }) {
  const segments = useMemo(() => splitHighlight(text, query), [text, query]);
  return (
    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">
      {segments.map((seg, i) =>
        seg.hit ? (
          <mark key={i} className="ordex-search-hit">{seg.text}</mark>
        ) : (
          <FormattedSegment key={i} text={seg.text} selfName={selfName} />
        ),
      )}
    </p>
  );
}

/** Renders one non-highlighted segment: mentions + Discord-style formatting. */
function FormattedSegment({ text, selfName }: { text: string; selfName?: string }) {
  const parts = useMemo(() => text.split(/(@[\wçğıöşüÇĞİÖŞÜ.]{2,32})/gu), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span
            key={i}
            className={cn(
              "rounded bg-[var(--ordex-accent-soft)] px-1 font-medium text-[var(--ordex-accent)]",
              selfName && part.toLowerCase() === `@${selfName.toLowerCase()}` && "bg-sky-500/20 text-sky-300",
            )}
          >
            {part}
          </span>
        ) : (
          <Fragment key={i}>{renderFormattedMessage(part)}</Fragment>
        ),
      )}
    </>
  );
}

interface Reaction {
  _id: string;
  messageId: string;
  emoji: string;
  userId: string;
}

interface Gif {
  id: string;
  url: string;
  preview: string;
  desc: string;
}

// Reuses the backend Tenor proxy (src/convex/tenor.ts, fetchTenorGifs):
// the API key stays server-side, browser calls go through the Convex action
// (or the public GET /api/gifs endpoint for external tools).

export function ChatPanel({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const messages = (useQuery(api.chat.listMessages, { roomId: roomId as never }) ?? []).slice().reverse() as ChatMessage[];
  const reactions = useQuery(api.chat.listReactions, { roomId: roomId as never }) ?? [];
  // 📌 Pinned messages band + toggle mutation (reactive).
  const pinned = useQuery(api.chat.listPinnedRoomMessages, { roomId: roomId as never }) ?? [];
  const togglePin = useMutation(api.chat.toggleRoomPin);

  // Rich profiles (name color + badges) for message authors.
  const authorIds = useMemo(() => [...new Set(messages.map((m) => m.userId))] as never[], [messages]);
  const profileRows = useQuery(
    api.users.getUsersPublic,
    authorIds.length > 0 ? { userIds: authorIds } : "skip",
  );
  const profiles = useMemo(
    () => new Map((profileRows ?? []).map((p) => [String(p._id), p])),
    [profileRows],
  );
  const profileFor = (m: ChatMessage) => profiles.get(String(m.userId));

  const sendMessage = useMutation(api.chat.sendMessage);
  const toggleReaction = useMutation(api.chat.toggleReaction);
  const searchGifs = useAction(api.tenor.searchGifs);
  const sendFriendRequest = useMutation(api.social.sendFriendRequest);
  const markRoomRead = useMutation(api.dms.markRoomRead);

  // Read cursor: keep this room's unread badge (tab title + list) cleared
  // while the panel is open and when new messages stream in.
  useEffect(() => {
    void markRoomRead({ roomId: roomId as never }).catch(() => undefined);
  }, [roomId, markRoomRead, messages.length]);

  const addFriendByName = (name: string) => {
    void sendFriendRequest({ name })
      .then(() => toast.success(`${name} kullanıcısına arkadaşlık isteği gönderildi.`))
      .catch((err) => toast.error(err instanceof Error ? err.message : "İstek gönderilemedi."));
  };

  const [text, setText] = useState("");
  const [showGifs, setShowGifs] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // ---------- 🔍 Chat search ----------
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);
  const q = query.trim().toLowerCase();
  const matchesQuery = (m: ChatMessage) =>
    q.length >= 2 && ((m.text ?? "").toLowerCase().includes(q) || (m.userName ?? "").toLowerCase().includes(q));
  const visibleMessages = q.length >= 2 ? messages.filter(matchesQuery) : messages;
  // Jump to (focus) a message: scrolls the full history and flashes a ring.
  const focusMessage = (messageId: string) => {
    setQuery("");
    requestAnimationFrame(() => {
      const el = document.getElementById(`room-msg-${messageId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ordex-search-active");
      window.setTimeout(() => el?.classList.remove("ordex-search-active"), 1600);
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    const clean = text.trim();
    if (!clean) return;
    setText("");
    void sendMessage({ roomId: roomId as never, text: clean }).catch(() => undefined);
  };

  const openGifs = () => {
    setShowGifs((v) => !v);
    if (gifs.length === 0 && !gifLoading) void loadGifs("");
  };

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

  const reactionGroups = new Map<string, Map<string, number>>();
  for (const r of reactions as Reaction[]) {
    let byEmoji = reactionGroups.get(r.messageId);
    if (!byEmoji) {
      byEmoji = new Map();
      reactionGroups.set(r.messageId, byEmoji);
    }
    byEmoji.set(r.emoji, (byEmoji.get(r.emoji) ?? 0) + 1);
  }

  return (
    <section className="ordex-panel flex h-full min-h-0 w-full flex-col text-zinc-200">
      {/* 🔍 Search bar (toggled from the magnifier) */}
      {searchOpen && (
        <div className="ordex-inset flex items-center gap-2 border-b border-white/5 px-2.5 py-2">
          <Search className="size-3.5 shrink-0 text-zinc-500" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
            placeholder="Mesajlarda ara..."
            className="h-7 min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          {query.trim().length >= 2 && (
            <span className="shrink-0 text-[10px] text-zinc-500">{visibleMessages.length} sonuç</span>
          )}
          <button
            type="button"
            className="rounded p-0.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
            title="Aramayı kapat (ESC)"
            onClick={() => {
              setSearchOpen(false);
              setQuery("");
            }}
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* 📌 Pinned messages band — click to jump, ✕ to unpin */}
      {pinned.length > 0 && (
        <div className="ordex-inset max-h-24 space-y-1 overflow-y-auto border-b border-white/5 px-2.5 py-1.5 [scrollbar-width:thin]">
          {pinned.map((p) => (
            <div key={p._id} className="flex items-center gap-1.5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-white/5"
                title="Mesaja git"
                onClick={() => focusMessage(p._id)}
              >
                <Pin className="size-3 shrink-0 text-amber-400" />
                <span className="shrink-0 text-[10px] font-semibold text-zinc-300">{p.userName}</span>
                <span className="min-w-0 truncate text-[10px] text-zinc-500">
                  {p.text ?? "medya"}
                </span>
                <span className="shrink-0 text-[9px] text-zinc-600">
                  · {p.pinnedByName} sabitledi
                </span>
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-zinc-600 hover:bg-white/10 hover:text-red-400"
                title="Sabitlemeyi kaldır"
                onClick={() => void togglePin({ messageId: p._id as never }).catch(() => undefined)}
              >
                <PinOff className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {visibleMessages.length === 0 && q.length >= 2 && (
          <p className="py-6 text-center text-xs text-zinc-600">Eşleşen mesaj bulunamadı.</p>
        )}
        {visibleMessages.length === 0 && q.length < 2 && (
          <p className="py-6 text-center text-xs text-zinc-600">
            Sohbet burada başlar. Merhaba de 👋
          </p>
        )}
        {visibleMessages.map((m) => {
          const mine = user?._id === m.userId;
          const profile = profileFor(m);
          const nameColor = profile?.nameColor;
          const groups = reactionGroups.get(m._id);
          return (
            <div key={m._id} id={`room-msg-${m._id}`} className="group relative mb-3 flex gap-2 scroll-mt-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="mt-0.5 shrink-0 outline-none" title="Profil">
                    <span
                      className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: `hsl(${avatarHue(m.userId)} 65% 45%)` }}
                    >
                      {initials(m.userName)}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent side="right" className="ordex-panel-2 w-72 border-white/10 p-0">
                  <UserProfileCard
                    user={{
                      _id: String(m.userId),
                      name: m.userName,
                      avatarUrl: profile?.avatarUrl,
                      statusMessage: profile?.statusMessage,
                      nameColor: profile?.nameColor,
                      badges: profile?.badges,
                    }}
                  />
                </PopoverContent>
              </Popover>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {mine ? (
                    <span
                      className="truncate text-xs font-semibold"
                      style={{ color: nameColor ?? "var(--ordex-text, #f4f4f5)" }}
                    >
                      {m.userName}
                    </span>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          className="truncate text-xs font-semibold hover:underline"
                          style={{ color: nameColor ?? "var(--ordex-text, #f4f4f5)" }}
                          title="Arkadaş ekle"
                        >
                          {m.userName}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="ordex-panel-2 w-56 border-white/10 p-2">
                        <p className="px-1 pb-2 text-[11px] text-zinc-500">
                          {m.userName} için işlem seç:
                        </p>
                        <Button
                          size="sm"
                          className="h-8 w-full justify-start gap-2 bg-[var(--ordex-accent)] text-xs text-white hover:bg-[var(--ordex-accent-hover)]"
                          onClick={() => addFriendByName(m.userName)}
                        >
                          <UserPlus className="size-3.5" /> Arkadaş olarak ekle
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-1.5 h-8 w-full justify-start gap-2 bg-white/10 text-xs text-zinc-100 hover:bg-white/15"
                          onClick={() => {
                            const p = profiles.get(String(m.userId));
                            openSocialView({
                              kind: "dm",
                              peer: {
                                _id: String(m.userId),
                                name: m.userName,
                                avatarUrl: p?.avatarUrl,
                                statusMessage: p?.statusMessage,
                                nameColor: p?.nameColor,
                                badges: p?.badges,
                              },
                            });
                          }}
                        >
                          <MessageSquare className="size-3.5" /> DM at
                        </Button>
                        <p className="px-1 pt-1.5 text-[10px] text-zinc-600">
                          DM için sol paneldeki "Arkadaşlar" sekmesini kullan.
                        </p>
                      </PopoverContent>
                    </Popover>
                  )}
                  {(profile?.badges ?? []).map((b) => {
                    const meta = badgeMeta(b);
                    return meta ? (
                      <span key={b} title={meta.label}>
                        {meta.icon}
                      </span>
                    ) : null;
                  })}
                  <span className="shrink-0 text-[10px] text-zinc-600">
                    {new Date(m.createdAt).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {m.text && (
                  <HighlightText text={m.text} query={q} selfName={user?.name ?? undefined} />
                )}
                {m.gifUrl && (
                  <img
                    src={m.gifThumb ?? m.gifUrl}
                    alt={m.text ?? "GIF"}
                    className="mt-1 max-h-36 cursor-zoom-in rounded-md border border-white/10 transition-transform hover:opacity-90"
                    loading="lazy"
                    onClick={() => setLightbox(m.gifUrl ?? m.gifThumb ?? null)}
                  />
                )}
                {groups && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...groups.entries()].map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => void toggleReaction({ messageId: m._id as never, emoji })}
                        className="ordex-chip rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] hover:border-white/25"
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Hover reaction bar + 📌 pin toggle */}
              <div className="absolute -top-2 right-1 hidden items-center gap-0.5 rounded-full border border-white/10 bg-[var(--ordex-panel-2)] px-1 py-0.5 shadow group-hover:flex">
                <button
                  onClick={() => void togglePin({ messageId: m._id as never }).catch(() => undefined)}
                  className={cn(
                    "rounded p-0.5 transition-transform hover:scale-110",
                    m.pinned ? "text-amber-400" : "text-zinc-500 hover:text-amber-400",
                  )}
                  title={m.pinned ? "Sabitlemeyi kaldır" : "Mesajı sabitle"}
                >
                  {m.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
                </button>
                {QUICK_EMOJIS.slice(0, 5).map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => void toggleReaction({ messageId: m._id as never, emoji })}
                    className="rounded px-0.5 text-xs hover:scale-125 transition-transform"
                    title={`${emoji} ile tepki ver`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* GIF picker */}
      {showGifs && (
        <div className="border-t border-white/5 ordex-inset p-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-600" />
              <Input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadGifs(gifQuery)}
                placeholder="GIF ara..."
                className="h-8 border-white/10 bg-[var(--ordex-panel-2)] pl-8 text-xs placeholder:text-zinc-600"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-2 text-xs"
              onClick={() => void loadGifs(gifQuery)}
            >
              Ara
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-zinc-500 hover:text-zinc-200"
              onClick={() => setShowGifs(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="mt-2 grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto [scrollbar-width:thin]">
            {gifLoading && (
              <div className="col-span-3 flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin text-zinc-500" />
              </div>
            )}
            {gifError && <p className="col-span-3 text-[11px] text-amber-400">{gifError}</p>}
            {gifs.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  void sendMessage({ roomId: roomId as never, gifUrl: gif.url, gifThumb: gif.preview });
                  setShowGifs(false);
                }}
                className="overflow-hidden rounded-md border border-transparent transition-colors hover:border-red-500/60"
              >
                <img src={gif.preview} alt={gif.desc} className="h-20 w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="flex items-center gap-2 border-t border-white/5 p-2">
        <Button
          size="icon"
          variant="ghost"
          className={cn(
            "size-8 shrink-0",
            searchOpen ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:bg-white/10 hover:text-zinc-100",
          )}
          title="Mesajlarda ara"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <Search className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="GIF gönder"
          onClick={openGifs}
        >
          <ImageIcon className="size-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Mesaj yaz..."
          maxLength={2000}
          className="ordex-inset h-9 border-white/10 text-xs placeholder:text-zinc-600 focus-visible:ring-red-500/40"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Tepki ekle"
          onClick={() => setText((t) => `${t}👍`)}
        >
          <SmilePlus className="size-4" />
        </Button>
        <Button
          size="icon"
          className="size-8 shrink-0 bg-red-600 text-white hover:bg-red-500"
          title="Gönder"
          onClick={send}
          disabled={!text.trim()}
        >
          <Send className="size-4" />
        </Button>
      </div>

      {/* Full-screen image viewer (chat photo zoom) */}
      {lightbox && <Lightbox src={lightbox} alt="Sohbet görseli" onClose={() => setLightbox(null)} />}
    </section>
  );
}
