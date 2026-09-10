import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { useAction, useMutation, useQuery } from "convex/react";
import { Image as ImageIcon, Loader2, MessageSquare, Search, Send, SmilePlus, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { MentionText, openSocialView } from "@/components/social/SocialOverlay";

const QUICK_EMOJIS = ["👍", "😂", "❤️", "🔥", "😮", "😢", "🎉", "👀"];

interface ChatMessage {
  _id: string;
  userId: string;
  userName: string;
  text?: string;
  gifUrl?: string;
  gifThumb?: string;
  createdAt: number;
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-zinc-600">
            Sohbet burada başlar. Merhaba de 👋
          </p>
        )}
        {messages.map((m) => {
          const mine = user?._id === m.userId;
          const profile = profileFor(m);
          const nameColor = profile?.nameColor;
          const groups = reactionGroups.get(m._id);
          return (
            <div key={m._id} className="group relative mb-3 flex gap-2">
              <span
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: `hsl(${avatarHue(m.userId)} 65% 45%)` }}
              >
                {initials(m.userName)}
              </span>
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
                  <MentionText text={m.text} selfName={user?.name ?? undefined} />
                )}
                {m.gifUrl && (
                  <img
                    src={m.gifThumb ?? m.gifUrl}
                    alt={m.text ?? "GIF"}
                    className="mt-1 max-h-36 rounded-md border border-white/10"
                    loading="lazy"
                  />
                )}
                {groups && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {[...groups.entries()].map(([emoji, count]) => (
                      <button
                        key={emoji}
                        onClick={() => void toggleReaction({ messageId: m._id as never, emoji })}
                        className="rounded-full border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-white/25"
                      >
                        {emoji} {count}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Hover reaction bar */}
              <div className="absolute -top-2 right-1 hidden gap-0.5 rounded-full border border-white/10 bg-[#1a1d21] px-1 py-0.5 shadow group-hover:flex">
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
        <div className="border-t border-white/5 bg-black/30 p-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-zinc-600" />
              <Input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadGifs(gifQuery)}
                placeholder="GIF ara..."
                className="h-8 border-white/10 bg-black/40 pl-8 text-xs placeholder:text-zinc-600"
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
          className="h-9 border-white/10 bg-black/30 text-xs placeholder:text-zinc-600 focus-visible:ring-red-500/40"
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
    </section>
  );
}
