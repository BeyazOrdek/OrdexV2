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
  CornerUpLeft,
  Hash,
  Headphones,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Pencil,
  Phone,
  PhoneOff,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  Smile,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { badgeMeta } from "@/lib/profile";
import { readImageFile } from "@/lib/profile";

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

/** Profile avatar that opens the Discord-style profile card on click. */
export function ProfileAvatar({ user, size = 8 }: { user: PublicUserLite; size?: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="shrink-0 outline-none" title={`${user.name} profili`}>
          <Avatar user={user} size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="ordex-panel-2 w-72 border-white/10 p-0">
        <UserProfileCard user={user} />
      </PopoverContent>
    </Popover>
  );
}

/** Discord-style mini profile card: banner, avatar, status, badges, DM CTA. */
export function UserProfileCard({ user }: { user: PublicUserLite }) {
  const { user: me } = useAuth();
  const isMe = me?._id === user._id;
  return (
    <div className="overflow-hidden rounded-lg">
      {/* Banner */}
      <div
        className="h-16 w-full"
        style={{ background: "linear-gradient(135deg, var(--ordex-accent) 0%, var(--ordex-panel-3) 100%)" }}
      />
      <div className="relative px-3 pb-3">
        <div className="-mt-7 mb-2 w-fit rounded-full border-4 border-[var(--ordex-panel-2)]">
          <Avatar user={user} size={14} />
        </div>
        <p className="truncate text-sm font-bold text-zinc-100">{user.name}</p>
        {user.statusMessage && (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{user.statusMessage}</p>
        )}
        {(user.badges?.length ?? 0) > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {(user.badges ?? []).map((b) => {
              const meta = badgeMeta(b);
              return meta ? (
                <span
                  key={b}
                  className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", meta.className)}
                  title={meta.label}
                >
                  {meta.icon} {meta.label}
                </span>
              ) : null;
            })}
          </div>
        )}
        {!isMe && (
          <Button
            size="sm"
            className="mt-3 h-8 w-full gap-2 bg-[var(--ordex-accent)] text-xs text-white hover:bg-[var(--ordex-accent-hover)]"
            onClick={() => {
              openSocialView({ kind: "dm", peer: user });
            }}
          >
            <Send className="size-3.5" /> DM Gönder
          </Button>
        )}
      </div>
    </div>
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

// ---------- shared chat formatting helpers ----------

/** "Bugün 20:34" / "Dün 09:12" / "12 Mar 14:05" Discord-style stamps. */
function formatStamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= dayStart) return `Bugün ${time}`;
  if (ts >= dayStart - 86_400_000) return `Dün ${time}`;
  return `${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${time}`;
}

function TypingRow({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label =
    names.length === 1
      ? `${names[0]} yazıyor...`
      : names.length === 2
        ? `${names[0]} ve ${names[1]} yazıyor...`
        : `${names[0]} ve ${names.length - 1} kişi yazıyor...`;
  return (
    <div className="flex items-center gap-2 px-3 pb-1">
      <span className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="ordex-typing-dot size-1.5 rounded-full bg-emerald-400" />
        ))}
      </span>
      <span className="text-[10px] italic text-emerald-400/90">{label}</span>
    </div>
  );
}

/** Shared message action bar (reply / edit / delete) shown on hover. */
function MessageActions({
  mine,
  onReply,
  onEdit,
  onDelete,
}: {
  mine: boolean;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="absolute -top-2 right-1 hidden items-center gap-0.5 rounded-full border border-white/10 bg-[var(--ordex-panel-3)] px-1 py-0.5 shadow-lg group-hover:flex">
      <button
        onClick={onReply}
        className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
        title="Yanıtla"
      >
        <Reply className="size-3" />
      </button>
      {mine && onEdit && (
        <button
          onClick={onEdit}
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Düzenle"
        >
          <Pencil className="size-3" />
        </button>
      )}
      {mine && onDelete && (
        <button
          onClick={onDelete}
          className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-red-400"
          title="Sil"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}

/** Thin quoted line shown above a reply. */
function ReplyPreview({ userName, text }: { userName: string; text?: string }) {
  return (
    <div className="mb-1 flex items-start gap-1.5 border-l-2 border-[var(--ordex-accent)] pl-1.5 opacity-80">
      <CornerUpLeft className="mt-0.5 size-2.5 shrink-0 text-[var(--ordex-accent)]" />
      <p className="min-w-0 truncate text-[10px] text-zinc-400">
        <span className="font-semibold text-zinc-300">{userName}</span>
        {text ? ` ${text}` : " medya gönderdi"}
      </p>
    </div>
  );
}

/**
 * File picker → data-url. Images are downscaled client-side (max 640px,
 * jpeg 0.8) so previews stay inside the users document limit; non-images
 * are rejected — v1 chat ships photo/media previews only.
 */
async function readChatImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Sadece görsel dosyalar gönderilebilir.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
  if (file.type === "image/gif") {
    if (dataUrl.length > 280_000) throw new Error("GIF çok büyük — daha küçük bir dosya seç.");
    return dataUrl;
  }
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Görsel yüklenemedi."));
    image.src = dataUrl;
  });
  const scale = Math.min(1, 640 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/jpeg", 0.8);
  if (out.length > 280_000) throw new Error("Görsel çok büyük — daha küçük bir dosya seç.");
  return out;
}

// ---------- Discord-style top call banner ----------

/**
 * Dark, sleek call panel rendered at the TOP of the DM chat area (Discord's
 * call banner): both avatars side by side with the green speaking ring +
 * curved sound-wave animation while ringing/talking, and mic / headphone /
 * red hang-up controls in a row. Replaces the old bottom-left mini card.
 */
function CallBanner({
  state,
  peerName,
  peerAvatar,
  selfUser,
  onHangUp,
}: {
  state: "ringing" | "active";
  peerName: string;
  peerAvatar?: string;
  selfUser: { _id: string; name: string; avatarUrl?: string } | null;
  onHangUp: () => void;
}) {
  const snap = useCallState();
  const controls = getCallControls();
  return (
    <div className="ordex-panel-2 border-b border-white/10 px-4 py-4">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
        <div className="flex items-center gap-6">
          {/* Self avatar */}
          <div className="flex flex-col items-center gap-1.5">
            <span className="relative flex size-16 items-center justify-center rounded-full">
              {selfUser?.avatarUrl ? (
                <img src={selfUser.avatarUrl} alt="Sen" className="size-14 rounded-full border border-white/15 object-cover" />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-[var(--ordex-panel-3)] text-sm font-bold text-[var(--ordex-accent)]">
                  {initials(selfUser?.name ?? "Sen")}
                </span>
              )}
              {!snap.micOn && (
                <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-600">
                  <MicOff className="size-3 text-white" />
                </span>
              )}
            </span>
            <span className="max-w-20 truncate text-[10px] font-medium text-zinc-400">Sen</span>
          </div>

          {/* Sound wave between the avatars */}
          <div className="flex h-10 items-end gap-1" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="ordex-call-wave w-1 rounded-full bg-emerald-400/80"
                style={{
                  height: state === "active" ? `${8 + (i % 3) * 6}px` : "6px",
                  animationDelay: `${i * 0.12}s`,
                  animationDuration: state === "active" ? "1.1s" : "2s",
                }}
              />
            ))}
          </div>

          {/* Peer avatar */}
          <div className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "relative flex size-16 items-center justify-center rounded-full",
                "ordex-call-ring",
              )}
            >
              {peerAvatar ? (
                <img src={peerAvatar} alt={peerName} className="size-14 rounded-full border border-white/15 object-cover" />
              ) : (
                <span className="flex size-14 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-sm font-bold text-[var(--ordex-accent)]">
                  {initials(peerName)}
                </span>
              )}
            </span>
            <span className="max-w-20 truncate text-[10px] font-medium text-zinc-400">{peerName}</span>
          </div>
        </div>

        <p className="text-xs font-semibold text-zinc-200">
          {state === "ringing" ? `${peerName} aranıyor... çalıyor` : "Görüşme sürüyor"}
        </p>

        {/* Mic / headphone / hang-up controls */}
        <div className="mt-1 flex items-center gap-2">
          <Button
            size="icon"
            variant={snap.micOn ? "secondary" : "destructive"}
            className="size-10 rounded-full"
            title={snap.micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
            onClick={() => controls?.toggleMic()}
            disabled={!controls}
          >
            {snap.micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant={snap.deafened ? "destructive" : "secondary"}
            className="size-10 rounded-full"
            title={snap.deafened ? "Kulaklığı aç" : "Kulaklığı kapat"}
            onClick={() => controls?.toggleDeafen()}
            disabled={!controls}
          >
            {snap.deafened ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </Button>
          <Button
            size="icon"
            className="size-10 rounded-full bg-red-600 text-white hover:bg-red-500"
            title="Aramayı sonlandır"
            onClick={onHangUp}
          >
            <PhoneOff className="size-4" />
          </Button>
        </div>
      </div>
    </div>
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
  const editDm = useMutation(api.dms.editDm);
  const deleteDm = useMutation(api.dms.deleteDm);
  const setTyping = useMutation(api.dms.setTyping);
  const clearTyping = useMutation(api.dms.clearTyping);
  const searchGifs = useActionSafe();
  const callState = useCallState();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ _id: string; userName: string; text?: string } | null>(null);
  const [editing, setEditing] = useState<{ _id: string; text: string } | null>(null);
  const [showGifs, setShowGifs] = useState(false);
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string; desc: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Live typing indicator (peer) + broadcast mine. TYPING_TTL on the server
  // makes stale rows vanish even if a tab crashes mid-keystroke.
  const typing = useQuery(api.dms.listTyping, { scope: "dm", targetId: peer._id });
  const typingNames = (typing ?? []).map((t) => t.userName);
  const lastTypingSentRef = useRef(0);
  const handleType = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      void setTyping({ scope: "dm", targetId: peer._id }).catch(() => undefined);
    }
  };
  const stopTyping = () => {
    if (lastTypingSentRef.current !== 0) {
      lastTypingSentRef.current = 0;
      void clearTyping({ scope: "dm", targetId: peer._id }).catch(() => undefined);
    }
  };

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
  }, [messages.length, typingNames.length]);

  useEffect(() => stopTyping, [peer._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (gif?: { url: string; preview: string }) => {
    const clean = text.trim();
    if (!clean && !gif) return;
    setText("");
    setReplyTo(null);
    stopTyping();
    void sendDm({
      recipientId: peer._id as never,
      text: clean || undefined,
      gifUrl: gif?.url,
      gifThumb: gif?.preview,
      replyToId: replyTo ? (replyTo._id as never) : undefined,
    }).catch(() => undefined);
  };

  const sendImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await readChatImage(file);
      void sendDm({
        recipientId: peer._id as never,
        gifUrl: dataUrl,
        gifThumb: dataUrl,
        replyToId: replyTo ? (replyTo._id as never) : undefined,
      }).catch(() => undefined);
      setReplyTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel gönderilemedi.");
    }
  };

  const saveEdit = () => {
    if (!editing) return;
    const clean = editing.text.trim();
    if (clean) void editDm({ messageId: editing._id as never, text: clean }).catch(() => undefined);
    setEditing(null);
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
      {/* ============ Discord-style top call banner (when a call is live) ============ */}
      {callState.active && callState.peerName && (
        <CallBanner
          state={callState.ringing ? "ringing" : "active"}
          peerName={callState.peerName}
          peerAvatar={callState.peerAvatar}
          selfUser={user ? { _id: user._id, name: user.name ?? "Misafir", avatarUrl: user.avatarUrl ?? undefined } : null}
          onHangUp={endActiveCall}
        />
      )}

      <div className="flex items-center gap-2 border-b border-white/5 p-3">
        <Button size="icon" variant="ghost" className="size-7 text-zinc-400 hover:bg-white/10" onClick={onBack} title="Geri">
          <ArrowLeft className="size-4" />
        </Button>
        <ProfileAvatar user={peer} size={7} />
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
          <div key={m._id} className={cn("group relative flex flex-col", m.mine ? "items-end" : "items-start")}>
            {m.replyTo && <ReplyPreview userName={m.replyTo.userName} text={m.replyTo.text} />}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-2.5 py-1.5",
                m.mine ? "bg-[var(--ordex-accent-soft)] text-[var(--ordex-text)]" : "ordex-inset text-zinc-300",
              )}
            >
              {m.text && <MentionText text={m.text} selfName={user?.name ?? undefined} />}
              {m.gifUrl && <img src={m.gifThumb ?? m.gifUrl} alt="Medya" className="mt-1 max-h-36 rounded-md" loading="lazy" />}
            </div>
            <span className="mt-0.5 flex items-center gap-1.5 px-1 text-[9px] text-zinc-600">
              {formatStamp(m.createdAt)}
              {m.editedAt !== undefined && <span className="italic">(düzenlendi)</span>}
              {m.mine && <ReadTicks read={m.read === true} />}
            </span>
            <MessageActions
              mine={m.mine}
              onReply={() => setReplyTo({ _id: m._id, userName: m.senderName ?? peer.name, text: m.text })}
              onEdit={() => setEditing({ _id: m._id, text: m.text ?? "" })}
              onDelete={() => void deleteDm({ messageId: m._id as never }).catch(() => undefined)}
            />
          </div>
        ))}
        <TypingRow names={typingNames} />
      </div>

      {editing && (
        <div className="ordex-inset flex items-center gap-2 border-t border-white/5 p-2">
          <Pencil className="size-3.5 shrink-0 text-amber-400" />
          <Input
            value={editing.text}
            autoFocus
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }
              if (e.key === "Escape") setEditing(null);
            }}
            className="h-8 flex-1 border-white/10 bg-[var(--ordex-panel-2)] text-xs"
          />
          <Button size="sm" className="h-8 px-2 text-xs" onClick={saveEdit}>
            Kaydet
          </Button>
          <Button size="icon" variant="ghost" className="size-8 text-zinc-500" onClick={() => setEditing(null)}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      {replyTo && (
        <div className="ordex-inset flex items-center gap-2 border-t border-white/5 p-2">
          <Reply className="size-3.5 shrink-0 text-[var(--ordex-accent)]" />
          <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-200">{replyTo.userName}</span>
            {replyTo.text ? ` — ${replyTo.text}` : " — medya"}
          </p>
          <Button size="icon" variant="ghost" className="size-7 text-zinc-500" onClick={() => setReplyTo(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {showGifs && (
        <div className="ordex-inset border-t border-white/5 p-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="GIF ara..."
              onKeyDown={(e) => e.key === "Enter" && void loadGifs((e.target as HTMLInputElement).value)}
              className="h-8 border-white/10 bg-[var(--ordex-panel-2)] text-xs"
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

      <div className="flex items-center gap-1.5 border-t border-white/5 p-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Fotoğraf / medya gönder"
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="size-4" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void sendImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
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
          <Smile className="size-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleType();
          }}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={`${peer.name} kullanıcısına mesaj... (@bahset)`}
          className="ordex-inset h-9 border-white/10 text-xs"
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
  const editMsg = useMutation(api.dms.editGroupMessage);
  const deleteMsg = useMutation(api.dms.deleteGroupMessage);
  const renameGroup = useMutation(api.dms.renameGroup);
  const leaveGroup = useMutation(api.dms.leaveGroup);
  const setTyping = useMutation(api.dms.setTyping);
  const clearTyping = useMutation(api.dms.clearTyping);
  const searchGifs = useActionSafe();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<{ _id: string; userName: string; text?: string } | null>(null);
  const [editing, setEditing] = useState<{ _id: string; text: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showGifs, setShowGifs] = useState(false);
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string; desc: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Typing: same ephemeral pattern as DMs, scoped to the group id.
  const typing = useQuery(api.dms.listTyping, { scope: "group", targetId: groupId });
  const typingNames = (typing ?? []).map((t) => t.userName);
  const lastTypingSentRef = useRef(0);
  const handleType = () => {
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      void setTyping({ scope: "group", targetId: groupId }).catch(() => undefined);
    }
  };
  const stopTyping = () => {
    if (lastTypingSentRef.current !== 0) {
      lastTypingSentRef.current = 0;
      void clearTyping({ scope: "group", targetId: groupId }).catch(() => undefined);
    }
  };

  useEffect(() => {
    void markRead({ groupId }).catch(() => undefined);
  }, [groupId, markRead, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, typingNames.length]);

  useEffect(() => stopTyping, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = (gif?: { url: string; preview: string }) => {
    const clean = text.trim();
    if (!clean && !gif) return;
    setText("");
    setReplyTo(null);
    stopTyping();
    void sendMsg({
      groupId,
      text: clean || undefined,
      gifUrl: gif?.url,
      gifThumb: gif?.preview,
      replyToId: replyTo ? (replyTo._id as never) : undefined,
    }).catch(() => undefined);
  };

  const sendImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const dataUrl = await readChatImage(file);
      void sendMsg({
        groupId,
        gifUrl: dataUrl,
        gifThumb: dataUrl,
        replyToId: replyTo ? (replyTo._id as never) : undefined,
      }).catch(() => undefined);
      setReplyTo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel gönderilemedi.");
    }
  };

  const saveEdit = () => {
    if (!editing) return;
    const clean = editing.text.trim();
    if (clean) void editMsg({ messageId: editing._id as never, text: clean }).catch(() => undefined);
    setEditing(null);
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
              className="h-7 border-white/10 bg-[var(--ordex-panel-2)] text-xs"
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
          <div key={m._id} className={cn("group relative flex flex-col", m.mine ? "items-end" : "items-start")}>
            {m.replyTo && <ReplyPreview userName={m.replyTo.userName} text={m.replyTo.text} />}
            {!m.mine && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="mb-0.5 px-1 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200" title="Profili gör">
                    {m.userName}
                  </button>
                </PopoverTrigger>
                <PopoverContent side="top" className="ordex-panel-2 w-72 border-white/10 p-0">
                  <UserProfileCard user={{ _id: m.senderId, name: m.userName }} />
                </PopoverContent>
              </Popover>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-2.5 py-1.5",
                m.mine ? "bg-[var(--ordex-accent-soft)] text-[var(--ordex-text)]" : "ordex-inset text-zinc-300",
              )}
            >
              {m.text && <MentionText text={m.text} selfName={user?.name ?? undefined} />}
              {m.gifUrl && <img src={m.gifThumb ?? m.gifUrl} alt="Medya" className="mt-1 max-h-36 rounded-md" loading="lazy" />}
            </div>
            <span className="mt-0.5 flex items-center gap-1.5 px-1 text-[9px] text-zinc-600">
              {formatStamp(m.createdAt)}
              {m.editedAt !== undefined && <span className="italic">(düzenlendi)</span>}
              {m.mine && <ReadTicks read={m.readByAll === true} />}
            </span>
            <MessageActions
              mine={m.mine}
              onReply={() => setReplyTo({ _id: m._id, userName: m.userName, text: m.text })}
              onEdit={() => setEditing({ _id: m._id, text: m.text ?? "" })}
              onDelete={() => void deleteMsg({ messageId: m._id as never }).catch(() => undefined)}
            />
          </div>
        ))}
        <TypingRow names={typingNames} />
      </div>

      {editing && (
        <div className="ordex-inset flex items-center gap-2 border-t border-white/5 p-2">
          <Pencil className="size-3.5 shrink-0 text-amber-400" />
          <Input
            value={editing.text}
            autoFocus
            onChange={(e) => setEditing({ ...editing, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }
              if (e.key === "Escape") setEditing(null);
            }}
            className="h-8 flex-1 border-white/10 bg-[var(--ordex-panel-2)] text-xs"
          />
          <Button size="sm" className="h-8 px-2 text-xs" onClick={saveEdit}>
            Kaydet
          </Button>
          <Button size="icon" variant="ghost" className="size-8 text-zinc-500" onClick={() => setEditing(null)}>
            <X className="size-4" />
          </Button>
        </div>
      )}

      {replyTo && (
        <div className="ordex-inset flex items-center gap-2 border-t border-white/5 p-2">
          <Reply className="size-3.5 shrink-0 text-[var(--ordex-accent)]" />
          <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-400">
            <span className="font-semibold text-zinc-200">{replyTo.userName}</span>
            {replyTo.text ? ` — ${replyTo.text}` : " — medya"}
          </p>
          <Button size="icon" variant="ghost" className="size-7 text-zinc-500" onClick={() => setReplyTo(null)}>
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {showGifs && (
        <div className="ordex-inset border-t border-white/5 p-2">
          <div className="flex items-center gap-2">
            <Input
              placeholder="GIF ara..."
              onKeyDown={(e) => e.key === "Enter" && void loadGifs((e.target as HTMLInputElement).value)}
              className="h-8 border-white/10 bg-[var(--ordex-panel-2)] text-xs"
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

      <div className="flex items-center gap-1.5 border-t border-white/5 p-2">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Fotoğraf / medya gönder"
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="size-4" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void sendImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
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
          <Smile className="size-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            handleType();
          }}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder={`${group.name} grubuna mesaj... (@bahset)`}
          className="ordex-inset h-9 border-white/10 text-xs"
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
          className="ordex-inset h-9 border-white/10 text-xs"
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

  // Ongoing calls are NOT rendered here anymore: the Discord-style top call
  // banner (inside an open DM, or the fixed fallback banner in SocialOverlay)
  // owns the mic / headphone / hang-up controls. Keeping this bottom mini card
  // would double the call UI and re-create the old panel-collision bug.
  return null;
}

// ---------- Global call-state store (room voice panels stay in sync) ----------

/**
 * Single source of truth for "a 1:1 call is ringing/active right now".
 * Room-side panels (RightPanel voice card, GamingStage control bar) read this
 * through `useCallState()` and swap their join button for an end-call button,
 * so the bottom-left call card and the right-bottom voice card can never
 * show conflicting "join voice" vs "call running" states.
 */
interface CallStateSnapshot {
  /** Call ringing or active right now. */
  active: boolean;
  /** Peer display name for the compact override card. */
  peerName: string;
  /** Peer avatar url (top call banner). */
  peerAvatar?: string;
  /** True while ringing (outgoing or incoming) — drives the pulse animation. */
  ringing: boolean;
  /** Live mic state — drives the banner's mic-off badge. */
  micOn: boolean;
  /** Live deafen state — drives the banner's headphone button. */
  deafened: boolean;
}

let callState: CallStateSnapshot = { active: false, peerName: "", ringing: false, micOn: true, deafened: false };
const callStateListeners = new Set<() => void>();

function setCallState(next: CallStateSnapshot) {
  if (
    callState.active === next.active &&
    callState.peerName === next.peerName &&
    callState.peerAvatar === next.peerAvatar &&
    callState.ringing === next.ringing &&
    callState.micOn === next.micOn &&
    callState.deafened === next.deafened
  ) {
    return;
  }
  callState = next;
  for (const l of callStateListeners) l();
}

/** Latest useCall controls, called from the banner via `getCallControls()`. */
interface CallControls {
  toggleMic: () => void;
  toggleDeafen: () => void;
}
let callControlsExternal: CallControls | null = null;

/** Live call controls for the top banner (null when SocialOverlay absent). */
export function getCallControls(): CallControls | null {
  return callControlsExternal;
}

export function useCallState(): CallStateSnapshot {
  return useSyncExternalStore(
    (onChange) => {
      callStateListeners.add(onChange);
      return () => {
        callStateListeners.delete(onChange);
      };
    },
    () => callState,
    () => callState,
  );
}

/** Latest useCall actions, called from anywhere via `endActiveCall()`. */
let endActiveCallExternal: (() => void) | null = null;

/** Ends the current 1:1 call (reject when ringing, hang up when active). */
export function endActiveCall() {
  endActiveCallExternal?.();
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

// ---------- Full-screen social view (home page, outside any room) ----------

// Fan-out listeners: both the Dashboard mirror and the HomeSocialStage
// subscribe, so every subscriber always holds a consistent view state
// (a single-slot handle went stale when the stage unmounted).
const homeSocialListeners = new Set<(view: SocialView) => void>();

/** The home page reports its current full-screen social view here. */
export function setHomeSocialView(view: SocialView) {
  for (const l of homeSocialListeners) l(view);
}

/** React hook mirror of the home page's full-screen social view. */
export function useHomeSocialView(): SocialView {
  const [view, setView] = useState<SocialView>(null);
  useEffect(() => {
    homeSocialListeners.add(setView);
    return () => {
      homeSocialListeners.delete(setView);
    };
  }, []);
  return view;
}

// Latest useCall actions from the single SocialOverlay instance.
let startCallExternal: ((peerId: string, peerName: string, peerAvatar?: string) => void) | null = null;

/**
 * Starts a 1:1 voice call from anywhere (home page, panels). Delegates to the
 * single SocialOverlay's useCall instance so call state stays in one place —
 * mounting a second useCall would fork the WebRTC state.
 */
export function startCallWith(peerId: string, peerName: string, peerAvatar?: string) {
  startCallExternal?.(peerId, peerName, peerAvatar);
}

/**
 * Full-screen DM / group chat surface used on the home page (outside rooms).
 * Same message components as the room slide-over, so read ticks, GIFs, call
 * button and mention highlighting behave identically in both modes.
 * The view is passed as a prop (from the page's own useHomeSocialView mirror)
 * rather than subscribed here — the dispatch happens before this component
 * mounts, so a self-subscription would miss the very first open.
 */
export function HomeSocialStage({ view }: { view: SocialView }) {
  const startCallTo = useCallback(
    (peer: PublicUserLite) => startCallWith(peer._id, peer.name, peer.avatarUrl),
    [],
  );

  if (!view) return null;
  return (
    <div className="ordex-panel flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {view.kind === "dm" ? (
        <DmView peer={view.peer} onBack={() => setHomeSocialView(null)} onCall={startCallTo} />
      ) : (
        <GroupChatView groupId={view.groupId} onBack={() => setHomeSocialView(null)} />
      )}
    </div>
  );
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
/**
 * Opens a DM/group view. Inside a room it renders as the slide-over window;
 * on the home page (no active room) it takes over the full-screen chat stage,
 * so DMs never require joining a room.
 */
export function openSocialView(view: SocialView) {
  if (activeRoom === undefined) {
    for (const l of homeSocialListeners) l(view);
  } else {
    openSocialViewExternal?.(view);
  }
}

/** Imperative handle for the create-group modal. */
let openCreateGroupExternal: (() => void) | null = null;
export function openCreateGroupModal() {
  openCreateGroupExternal?.();
}

export function SocialOverlay() {
  useSoundBus();
  const call = useCall();
  const { user } = useAuth();
  const currentRoom = useActiveRoom();
  const inRoom = currentRoom !== undefined;
  const [view, setView] = useState<SocialView>(null);
  const homeView = useHomeSocialView();
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const dmOpen = view?.kind === "dm" || homeView?.kind === "dm";

  // Leaving a room drops any open slide-over chat; the home page owns the
  // full-screen stage instead, so the old window can never linger over it.
  useEffect(() => {
    if (!inRoom) setView(null);
  }, [inRoom]);

  useEffect(() => {
    openSocialViewExternal = setView;
    return () => {
      openSocialViewExternal = null;
    };
  }, []);

  // Publish full call state to every panel that reads `useCallState`:
  // room voice cards, the top call banner and the bottom-left profile bar.
  useEffect(() => {
    setCallState({
      active: call.state !== "idle" || call.incoming !== null,
      peerName: call.incoming?.peerName ?? call.peer?.name ?? "",
      peerAvatar: call.incoming?.peerAvatar ?? call.peer?.avatarUrl,
      ringing: call.incoming !== null || call.state === "outgoing-ringing",
      micOn: call.micOn,
      deafened: call.deafened,
    });
  }, [call.state, call.incoming, call.peer, call.micOn, call.deafened]);

  // Expose the live mic/headphone toggles to the call banner (the banner
  // renders outside this component's call hook scope).
  useEffect(() => {
    callControlsExternal = { toggleMic: call.toggleMic, toggleDeafen: call.toggleDeafen };
    return () => {
      callControlsExternal = null;
    };
  }, [call.toggleMic, call.toggleDeafen]);

  // Imperative end-call handle: reject incoming, hang up ongoing.
  const callRef = useRef(call);
  useEffect(() => {
    callRef.current = call;
  }, [call]);
  useEffect(() => {
    endActiveCallExternal = () => {
      if (callRef.current.incoming) callRef.current.reject();
      else callRef.current.hangUp();
    };
    return () => {
      endActiveCallExternal = null;
    };
  }, []);

  const startCallTo = (peer: PublicUserLite) => {
    void call.start(peer._id as Id<"users">, peer.name, peer.avatarUrl);
  };

  // Single start-call handle for the whole app (home page panels call this).
  useEffect(() => {
    startCallExternal = (peerId, peerName, peerAvatar) => {
      void call.start(peerId as Id<"users">, peerName, peerAvatar);
    };
    return () => {
      startCallExternal = null;
    };
  }, [call.start]);

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

      {/* Fixed fallback banner: when a call is live but no DM chat is open
          (started from the friends list), the banner still floats on top of
          the stage so mic / headphone / hang-up are always reachable. */}
      {call.state !== "idle" && !call.incoming && !dmOpen && (
        <div className="fixed left-1/2 top-0 z-[9986] w-full max-w-lg -translate-x-1/2 px-2 pt-2">
          <div className="ordex-panel-2 overflow-hidden rounded-xl border border-white/10 shadow-2xl shadow-black/60">
            <CallBanner
              state={call.state === "outgoing-ringing" ? "ringing" : "active"}
              peerName={call.peer?.name ?? "Arama"}
              peerAvatar={call.peer?.avatarUrl}
              selfUser={
                user
                  ? { _id: user._id, name: user.name ?? "Misafir", avatarUrl: user.avatarUrl ?? undefined }
                  : null
              }
              onHangUp={() => call.hangUp()}
            />
          </div>
        </div>
      )}

      {/* DM / Group window — slide-over inside rooms; on the home page the
          same views render full-screen via <HomeSocialStage view={...} />
          (Dashboard), so DMs never require joining a room. */}
      {view && inRoom && (
        <div className="ordex-panel fixed inset-y-0 right-0 z-[9985] flex w-full max-w-sm flex-col border-l border-white/10 shadow-2xl shadow-black/60 md:inset-y-0">
          {view.kind === "dm" ? (
            <DmView peer={view.peer} onBack={() => setView(null)} onCall={startCallTo} />
          ) : (
            <GroupChatView groupId={view.groupId} onBack={() => setView(null)} />
          )}
        </div>
      )}

      <CreateGroupModal
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        onCreated={(groupId) =>
          // Same routing as openSocialView: full-screen stage on the home
          // page, slide-over inside a room — a freshly created group chat is
          // shown immediately in whichever surface is active.
          currentRoom === undefined
            ? setHomeSocialView({ kind: "group", groupId })
            : setView({ kind: "group", groupId })
        }
      />

      {/* Floating quick actions (bottom-right, above mobile nav) — rooms only;
          the home page exposes the same actions inside its panels. */}
      {!view && inRoom && (
        <div className="fixed bottom-20 right-3 z-[9980] flex flex-col gap-2 md:bottom-4">
          <Button
            size="icon"
            className="ordex-panel-2 size-10 rounded-full border border-white/10 text-zinc-300 shadow-lg hover:text-white"
            title="Grup oluştur"
            onClick={() => setCreateGroupOpen(true)}
          >
            <Users className="size-4" />
          </Button>
          <Button
            size="icon"
            className="ordex-panel-2 size-10 rounded-full border border-white/10 text-zinc-300 shadow-lg hover:text-white"
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
