import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useCall } from "@/hooks/use-call";
import { playSound, useSoundBus } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeft,
  BellRing,
  Check,
  CheckCheck,
  Hash,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ---------- shared tiny bits ----------

interface PublicUserLite {
  _id: string;
  name: string;
  statusMessage?: string;
  avatarUrl?: string;
  nameColor?: string;
  badges?: string[];
}

const EMPTY_USERS: PublicUserLite[] = [];

function Avatar({ user, size = 8 }: { user: PublicUserLite; size?: number }) {
  const px = { width: `${size * 4}px`, height: `${size * 4}px` };
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.name} className="rounded-full border border-white/15 object-cover" style={px} />
  ) : (
    <span
      className="flex items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[10px] font-bold text-[var(--ordex-accent)]"
      style={px}
    >
      {initials(user.name)}
    </span>
  );
}

/** Render message text with @name mentions highlighted. */
export function MentionText({ text, selfName }: { text: string; selfName?: string }) {
  const parts = useMemo(() => text.split(/(@[\wçğıöşüÇĞİÖŞÜ.]{2,32})/gu), [text]);
  return (
    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-300">
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
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function ReadTicks({ read }: { read: boolean }) {
  return read ? (
    <span className="inline-flex items-center gap-0.5 text-sky-400" title="Görüldü">
      <CheckCheck className="size-3.5" />
    </span>
  ) : (
    <span className="inline-flex items-center text-zinc-500" title="Gönderildi">
      <Check className="size-3.5" />
    </span>
  );
}

// ---------- DM view ----------

function DmView({
  peer,
  onBack,
  onCall,
}: {
  peer: PublicUserLite;
  onBack: () => void;
  onCall: (peer: PublicUserLite) => void;
}) {
  const { user } = useAuth();
  const messages = useQuery(api.dms.listDms, { otherUserId: peer._id as never }) ?? [];
  const markRead = useMutation(api.dms.markDmsRead);
  const sendDm = useMutation(api.social.sendDm);
  const searchGifs = useActionSafe();

  const [text, setText] = useState("");
  const [showGifs, setShowGifs] = useState(false);
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string; desc: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Görüldü: mark the peer's messages read whenever the window is open and
  // new ones arrive; also pop the notification bip for fresh arrivals.
  const lastSeenCountRef = useRef(0);
  const initializedRef = useRef(false);
  useEffect(() => {
    void markRead({ otherUserId: peer._id as never }).catch(() => undefined);
    const incomingCount = messages.filter((m) => !m.mine).length;
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeenCountRef.current = incomingCount;
      return;
    }
    if (incomingCount > lastSeenCountRef.current) {
      lastSeenCountRef.current = incomingCount;
      playSound("bip");
    }
  }, [messages, markRead, peer._id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

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

  const loadGifs = async (q: string) => {
    setGifLoading(true);
    try {
      const result = await searchGifs({ query: q });
      setGifs(result.gifs);
    } catch {
      /* best-effort */
    } finally {
      setGifLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 p-3">
        <Button size="icon" variant="ghost" className="size-7 text-zinc-400 hover:bg-white/10" onClick={onBack} title="Geri">
          <ArrowLeft className="size-4" />
        </Button>
        <Avatar user={peer} size={7} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-zinc-100">{peer.name}</p>
          {peer.statusMessage && <p className="truncate text-[10px] text-zinc-600">{peer.statusMessage}</p>}
        </div>
        <Button
          size="icon"
          className="size-8 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
          title={`${peer.name} kişisini ara`}
          onClick={() => onCall(peer)}
        >
          <Phone className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-zinc-600">{peer.name} ile sohbetin burada başlar.</p>
        )}
        {messages.map((m) => (
          <div key={m._id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-2.5 py-1.5",
                m.mine ? "bg-[var(--ordex-accent-soft)] text-[var(--ordex-text)]" : "bg-black/30 text-zinc-300",
              )}
            >
              {m.text && <MentionText text={m.text} selfName={user?.name ?? undefined} />}
              {m.gifUrl && <img src={m.gifThumb ?? m.gifUrl} alt="GIF" className="mt-1 max-h-36 rounded-md" loading="lazy" />}
            </div>
            {m.mine && (
              <span className="mt-0.5 flex items-center gap-1 pr-1 text-[9px] text-zinc-600">
                <ReadTicks read={m.read === true} />
              </span>
            )}
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
          placeholder={`${peer.name} kullanıcısına mesaj... (@bahset)`}
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

// tenor action is always available (public action); wrap for clarity.
import { useAction } from "convex/react";
function useActionSafe() {
  return useAction(api.tenor.searchGifs);
}

// ---------- Group chat view ----------

function GroupChatView({ groupId, onBack }: { groupId: Id<"groups">; onBack: () => void }) {
  const { user } = useAuth();
  const group = useQuery(api.dms.getGroup, { groupId });
  const messages = useQuery(api.dms.listGroupMessages, { groupId }) ?? [];
  const markRead = useMutation(api.dms.markGroupRead);
  const sendMsg = useMutation(api.dms.sendGroupMessage);
  const renameGroup = useMutation(api.dms.renameGroup);
  const leaveGroup = useMutation(api.dms.leaveGroup);
  const searchGifs = useActionSafe();

  const [text, setText] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void markRead({ groupId }).catch(() => undefined);
  }, [groupId, markRead, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const send = (gif?: { url: string; preview: string }) => {
    const clean = text.trim();
    if (!clean && !gif) return;
    setText("");
    void sendMsg({ groupId, text: clean || undefined, gifUrl: gif?.url, gifThumb: gif?.preview }).catch(() => undefined);
  };

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-zinc-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-white/5 p-3">
        <Button size="icon" variant="ghost" className="size-7 text-zinc-400 hover:bg-white/10" onClick={onBack} title="Geri">
          <ArrowLeft className="size-4" />
        </Button>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
          <Users className="size-4" />
        </span>
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const name = nameDraft.trim();
              if (name) void renameGroup({ groupId, name }).catch(() => undefined);
              setRenaming(false);
            }}
          >
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              autoFocus
              className="h-7 border-white/10 bg-black/40 text-xs"
            />
            <Button size="icon" variant="ghost" className="size-7 text-emerald-400" type="submit">
              <Check className="size-3.5" />
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-zinc-100">{group.name}</p>
            <p className="truncate text-[10px] text-zinc-600">{group.members.length} üye</p>
          </div>
        )}
        {!renaming && (
          <Button
            size="icon"
            variant="ghost"
            className="size-7 text-zinc-500 hover:bg-white/10 hover:text-zinc-200"
            title="Grup adını değiştir"
            onClick={() => {
              setNameDraft(group.name);
              setRenaming(true);
            }}
          >
            <Pencil className="size-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-zinc-500 hover:bg-white/10 hover:text-red-400"
          title="Gruptan ayrıl"
          onClick={() => {
            void leaveGroup({ groupId }).catch(() => undefined);
            onBack();
          }}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && <p className="py-6 text-center text-xs text-zinc-600">Grup sohbeti burada başlar.</p>}
        {messages.map((m) => (
          <div key={m._id} className={cn("flex flex-col", m.mine ? "items-end" : "items-start")}>
            {!m.mine && (
              <span className="mb-0.5 px-1 text-[10px] font-semibold text-zinc-500">{m.userName}</span>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-2.5 py-1.5",
                m.mine ? "bg-[var(--ordex-accent-soft)] text-[var(--ordex-text)]" : "bg-black/30 text-zinc-300",
              )}
            >
              {m.text && <MentionText text={m.text} selfName={user?.name ?? undefined} />}
              {m.gifUrl && <img src={m.gifThumb ?? m.gifUrl} alt="GIF" className="mt-1 max-h-36 rounded-md" loading="lazy" />}
            </div>
            {m.mine && (
              <span className="mt-0.5 pr-1 text-zinc-600">
                <ReadTicks read={m.readByAll === true} />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-white/5 p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={`${group.name} grubuna mesaj... (@bahset)`}
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

// ---------- Create group modal ----------

function CreateGroupModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (groupId: Id<"groups">) => void;
}) {
  const friends = (useQuery(api.social.listFriends, {}) ?? EMPTY_USERS) as PublicUserLite[];
  const createGroup = useMutation(api.dms.createGroup);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const { groupId } = await createGroup({
        name: name.trim() || "Yeni Grup",
        memberIds: [...picked] as never[],
      });
      toast.success("Grup oluşturuldu.");
      setName("");
      setPicked(new Set());
      onOpenChange(false);
      onCreated(groupId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Grup oluşturulamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ordex-panel-2 border-white/10 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm text-zinc-100">Grup oluştur</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Grup adı..."
          className="h-9 border-white/10 bg-black/30 text-xs"
        />
        <div className="max-h-56 space-y-1 overflow-y-auto [scrollbar-width:thin]">
          {friends.length === 0 && <p className="px-1 py-2 text-xs text-zinc-600">Gruba eklemek için önce arkadaş ekle.</p>}
          {friends.map((f) => (
            <button
              key={f._id}
              onClick={() =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (next.has(f._id)) next.delete(f._id);
                  else next.add(f._id);
                  return next;
                })
              }
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                picked.has(f._id) ? "bg-[var(--ordex-accent-soft)]" : "hover:bg-white/5",
              )}
            >
              <Avatar user={f} size={7} />
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-200">{f.name}</span>
              {picked.has(f._id) && <Check className="size-3.5 text-emerald-400" />}
            </button>
          ))}
        </div>
        <Button
          onClick={() => void create()}
          disabled={busy || picked.size === 0}
          className="h-9 w-full gap-2 bg-[var(--ordex-accent)] text-xs text-white hover:bg-[var(--ordex-accent-hover)]"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Grubu oluştur ({picked.size} üye)
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Incoming call popup + in-call bar ----------

function CallUi({ call }: { call: ReturnType<typeof useCall> }) {
  // Incoming ring popup — driven entirely by the reactive incoming query.
  if (call.incoming) {
    return (
      <div className="fixed left-1/2 top-4 z-[9990] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2">
        <div className="ordex-panel-2 flex items-center gap-3 rounded-xl border border-white/10 p-3 shadow-2xl shadow-black/50">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)]">
            <BellRing className="size-5 animate-pulse text-[var(--ordex-accent)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-100">{call.incoming.peerName}</p>
            <p className="text-[11px] text-emerald-400">Sesli arama... çalıyor</p>
          </div>
          <Button
            size="icon"
            className="size-10 shrink-0 rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
            title="Kabul et"
            onClick={() => void call.accept()}
          >
            <Phone className="size-4" />
          </Button>
          <Button
            size="icon"
            className="size-10 shrink-0 rounded-full bg-red-600 text-white hover:bg-red-500"
            title="Reddet"
            onClick={call.reject}
          >
            <PhoneOff className="size-4" />
          </Button>
        </div>
      </div>
    );
  }

  const label = call.state === "outgoing-ringing" ? "Aranıyor..." : "Görüşme sürüyor";

  return (
    <div className="fixed bottom-20 left-1/2 z-[9990] w-[calc(100%-2rem)] max-w-xs -translate-x-1/2 md:bottom-4 md:left-4 md:translate-x-0">
      <div className="ordex-panel-2 flex items-center gap-3 rounded-xl border border-white/10 p-3 shadow-2xl shadow-black/50">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-600/20",
            call.state !== "active" && "animate-pulse",
          )}
        >
          <Phone className="size-4 text-emerald-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-100">{call.peer.name}</p>
          <p className="text-[11px] text-zinc-500">{label}</p>
        </div>
        <Button
          size="icon"
          variant={call.micOn ? "secondary" : "destructive"}
          className="size-8 shrink-0"
          title={call.micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
          onClick={call.toggleMic}
        >
          {call.micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        </Button>
        <Button
          size="icon"
          className="size-8 shrink-0 bg-red-600 text-white hover:bg-red-500"
          title="Aramayı bitir"
          onClick={call.hangUp}
        >
          <PhoneOff className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Active-room store (Room pages report where the user is) ----------

let activeRoom: Id<"rooms"> | undefined;
const roomListeners = new Set<(id: Id<"rooms"> | undefined) => void>();

/** Room.tsx calls this so mention/unread counting knows the open room. */
export function reportActiveRoom(id: Id<"rooms"> | undefined) {
  activeRoom = id;
  for (const l of roomListeners) l(id);
}

function useActiveRoom(): Id<"rooms"> | undefined {
  const [id, setId] = useState<Id<"rooms"> | undefined>(activeRoom);
  useEffect(() => {
    const l = (n: Id<"rooms"> | undefined) => setId(n);
    roomListeners.add(l);
    return () => {
      roomListeners.delete(l);
    };
  }, []);
  return id;
}

// ---------- Notification watcher + tab title ----------

function SocialWatcher() {
  const currentRoomId = useActiveRoom();
  const unread = useQuery(api.dms.listUnread, currentRoomId ? { currentRoomId } : {});
  const incoming = useQuery(api.dms.myIncomingCall, {});
  const markRoomRead = useMutation(api.dms.markRoomRead);

  // Browser tab title: (n) ÖRDEX
  const dmTotal = (unread?.dms ?? []).reduce((acc, d) => acc + d.count, 0);
  const groupTotal = (unread?.groups ?? []).reduce((acc, g) => acc + g.count, 0);
  const roomTotal = (unread?.roomUnread ?? 0) + (unread?.roomMentions ?? 0);
  useEffect(() => {
    const total = dmTotal + groupTotal + roomTotal;
    const base = "ÖRDEX";
    document.title = total > 0 ? `(${total}) ${base}` : base;
  }, [dmTotal, groupTotal, roomTotal]);

  // Open room counts as read (the watcher runs only on room pages' view).
  useEffect(() => {
    if (!currentRoomId) return;
    void markRoomRead({ roomId: currentRoomId }).catch(() => undefined);
  }, [currentRoomId, markRoomRead, unread?.roomUnread, unread?.roomMentions]);

  // Bip on brand-new incoming DMs (window-level; the DM view bip handles the open chat).
  const lastDmLatestRef = useRef(0);
  useEffect(() => {
    const latest = Math.max(0, ...(unread?.dms ?? []).map((d) => d.latest));
    if (lastDmLatestRef.current !== 0 && latest > lastDmLatestRef.current && !incoming) {
      playSound("bip");
    }
    lastDmLatestRef.current = latest;
  }, [unread, incoming]);

  return null;
}

// ---------- The overlay shell ----------

export type SocialView =
  | { kind: "dm"; peer: PublicUserLite }
  | { kind: "group"; groupId: Id<"groups"> }
  | null;

/** Imperative handle so panels can open a DM/group window from anywhere. */
let openSocialViewExternal: ((view: SocialView) => void) | null = null;
export function openSocialView(view: SocialView) {
  openSocialViewExternal?.(view);
}

/** Imperative handle for the create-group modal. */
let openCreateGroupExternal: (() => void) | null = null;
export function openCreateGroupModal() {
  openCreateGroupExternal?.();
}

export function SocialOverlay() {
  useSoundBus();
  const call = useCall();
  const [view, setView] = useState<SocialView>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);

  useEffect(() => {
    openSocialViewExternal = setView;
    return () => {
      openSocialViewExternal = null;
    };
  }, []);

  const startCallTo = (peer: PublicUserLite) => {
    void call.start(peer._id as Id<"users">, peer.name);
  };

  useEffect(() => {
    openCreateGroupExternal = () => setCreateGroupOpen(true);
    return () => {
      openCreateGroupExternal = null;
    };
  }, []);

  return (
    <>
      <SocialWatcher />
      <CallUi call={call} />

      {/* DM / Group window (slide-over above everything) */}
      {view && (
        <div className="fixed inset-y-0 right-0 z-[9985] flex w-full max-w-sm flex-col border-l border-white/10 bg-[var(--ordex-panel, #101214)] shadow-2xl shadow-black/60 md:inset-y-0">
          {view.kind === "dm" ? (
            <DmView peer={view.peer} onBack={() => setView(null)} onCall={startCallTo} />
          ) : (
            <GroupChatView groupId={view.groupId} onBack={() => setView(null)} />
          )}
        </div>
      )}

      <CreateGroupModal open={createGroupOpen} onOpenChange={setCreateGroupOpen} onCreated={(groupId) => setView({ kind: "group", groupId })} />

      {/* Floating quick actions (bottom-right, above mobile nav) */}
      {!view && (
        <div className="fixed bottom-20 right-3 z-[9980] flex flex-col gap-2 md:bottom-4">
          <Button
            size="icon"
            className="size-10 rounded-full border border-white/10 bg-[var(--ordex-panel-2, #1a1d21)] text-zinc-300 shadow-lg hover:text-white"
            title="Grup oluştur"
            onClick={() => setCreateGroupOpen(true)}
          >
            <Users className="size-4" />
          </Button>
          <Button
            size="icon"
            className="size-10 rounded-full border border-white/10 bg-[var(--ordex-panel-2, #1a1d21)] text-zinc-300 shadow-lg hover:text-white"
            title="Yeni DM"
            onClick={() => {
              const el = document.querySelector<HTMLButtonElement>("[data-ordex-friends-tab]");
              el?.click();
              toast.info("Arkadaşlar sekmesinden bir kişi seçerek DM başlat.");
            }}
          >
            <UserPlus className="size-4" />
          </Button>
        </div>
      )}
    </>
  );
}

// ---------- Badge hook for panels ----------

export interface BadgeInfo {
  dmByPeer: Map<string, number>;
  groupByGroup: Map<string, number>;
  dmTotal: number;
  groupTotal: number;
  roomUnread: number;
  roomMentions: number;
}

export function useUnreadBadges(): BadgeInfo {
  const currentRoomId = useActiveRoom();
  const unread = useQuery(api.dms.listUnread, currentRoomId ? { currentRoomId } : {});
  return useMemo(
    () => ({
      dmByPeer: new Map((unread?.dms ?? []).map((d) => [String(d.peerId), d.count])),
      groupByGroup: new Map((unread?.groups ?? []).map((g) => [String(g.groupId), g.count])),
      dmTotal: (unread?.dms ?? []).reduce((acc, d) => acc + d.count, 0),
      groupTotal: (unread?.groups ?? []).reduce((acc, g) => acc + g.count, 0),
      roomUnread: unread?.roomUnread ?? 0,
      roomMentions: unread?.roomMentions ?? 0,
    }),
    [unread],
  );
}

/** Red Discord-style count badge. */
export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Re-export for panels that want a compact search row (kept local to avoid cycles).
export { Search as SearchIcon, Hash as HashIcon };
