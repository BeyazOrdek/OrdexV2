import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import type { VoiceParticipant } from "@/hooks/use-voice";
import { cn } from "@/lib/utils";
import { initials, parseMediaLink, thumbFor } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import {
  AudioLines,
  Headphones,
  Link2,
  ListVideo,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Play,
  Trash2,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { endActiveCall, useCallState } from "@/components/social/SocialOverlay";

interface RightPanelProps {
  roomId: string;
  sessionId: string;
  participants: { sessionId: string; userName: string; avatarHue: number; inVoice: boolean }[];
  voiceParticipants: VoiceParticipant[];
  inVoice: boolean;
  micOn: boolean;
  camOn: boolean;
  voiceError: string | null;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  /** Krisp-style noise suppression (persisted). */
  krisp: boolean;
  onToggleKrisp: () => void;
  /** Local per-peer volume (0–200 %) — context-menu mixer. */
  getPeerVolume: (sessionId: string) => number;
  setPeerVolume: (sessionId: string, volume: number) => void;
}

export function RightPanel({
  roomId,
  sessionId,
  participants,
  voiceParticipants,
  inVoice,
  micOn,
  camOn,
  voiceError,
  onJoinVoice,
  onLeaveVoice,
  onToggleMic,
  onToggleCam,
  krisp,
  onToggleKrisp,
  getPeerVolume,
  setPeerVolume,
}: RightPanelProps) {
  const { user } = useAuth();
  const queue = useQuery(api.rooms.listQueue, { roomId: roomId as never }) ?? [];
  const addToQueue = useMutation(api.rooms.addToQueue);
  const removeQueueItem = useMutation(api.rooms.removeQueueItem);
  const playQueueItem = useMutation(api.rooms.playQueueItem);

  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const pending = queue.filter((q) => !q.played);

  const submitLink = () => {
    const media = parseMediaLink(link);
    if (!media) {
      setLinkError("YouTube veya doğrudan video linki gir (mp4/webm/tau-video de olur).");
      return;
    }
    setLinkError(null);
    setLink("");
    void addToQueue({
      roomId: roomId as never,
      videoId: media.key,
      mediaType: media.type,
      mediaUrl: media.url,
      title: media.title,
      thumb: media.thumb,
    }).catch((err) => setLinkError(err instanceof Error ? err.message : "Kuyruğa eklenemedi."));
  };

  return (
    <aside className="ordex-panel flex h-full w-full flex-col text-zinc-200">
      {/* Video request list */}
      <div className="border-b border-white/5 p-3">
        <p className="flex items-center gap-1.5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <ListVideo className="size-3.5" /> Video istekleri ({pending.length})
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-2.5 top-2.5 size-3.5 text-zinc-600" />
            <Input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitLink()}
              placeholder="YouTube veya mp4 linki yapıştır..."
              className="ordex-inset h-9 border-white/10 pl-8 text-xs placeholder:text-zinc-600 focus-visible:ring-[var(--ordex-accent)]/40"
            />
          </div>
          <Button
            size="sm"
            onClick={submitLink}
            className="h-9 shrink-0 bg-[var(--ordex-accent)] px-3 text-white hover:bg-[var(--ordex-accent-hover)]"
          >
            Ekle
          </Button>
        </div>
        {linkError && <p className="mt-1.5 text-[11px] text-red-400">{linkError}</p>}

        <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto [scrollbar-width:thin]">
          {pending.length === 0 && (
            <p className="ordex-inset rounded-md px-2 py-2 text-[11px] text-zinc-500">
              Sıra boş. Bir link ekleyerek başlat.
            </p>
          )}
          {pending.map((item, i) => (
            <div
              key={item._id}
              className="ordex-inset group flex items-center gap-2 rounded-md px-2 py-1.5"
            >
              <span className="w-4 shrink-0 text-center font-mono text-[10px] text-zinc-600">
                {i + 1}
              </span>
              <img
                src={item.thumb ?? (item.mediaType === "direct" ? undefined : thumbFor(item.videoId))}
                alt=""
                className={cn("h-8 w-14 shrink-0 rounded object-cover", !item.thumb && item.mediaType === "direct" && "bg-white/5 object-contain p-1")}
                loading="lazy"
              />
              <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">
                {item.title}
                <span className="block text-[10px] text-zinc-600">
                  {item.addedByName} ekledi
                </span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0 text-zinc-500 hover:bg-white/10 hover:text-emerald-400"
                title="Şimdi oynat"
                onClick={() => void playQueueItem({ itemId: item._id, sessionId })}
              >
                <Play className="size-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6 shrink-0 text-zinc-500 hover:bg-white/10 hover:text-red-400"
                title="Kaldır"
                onClick={() => void removeQueueItem({ itemId: item._id })}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Voice channel */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
        <div className="flex items-center justify-between pb-2">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            <Headphones className="size-3.5" /> Sesli kanal ({voiceParticipants.length})
          </p>
        </div>

        {voiceError && (
          <p className="mb-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-red-300">
            {voiceError}
          </p>
        )}

        <div className="space-y-1">
          {voiceParticipants.length === 0 && (
            <p className="ordex-inset rounded-md px-2 py-2 text-[11px] text-zinc-500">
              Sesli kanalda kimse yok. Mikrofonu açarak katıl.
            </p>
          )}
          {voiceParticipants.map((p) => (
            <ContextMenu key={p.sessionId}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "flex cursor-context-menu items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                    p.speaking ? "bg-emerald-500/10" : "bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 transition-shadow",
                      p.speaking ? "ring-emerald-400" : "ring-transparent",
                    )}
                    style={{ background: `hsl(${p.avatarHue} 65% 45%)` }}
                  >
                    {initials(p.userName)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                    {p.userName}
                    {p.isSelf && <span className="text-zinc-600"> (sen)</span>}
                  </span>
                  {!p.micOn && <MicOff className="size-3.5 shrink-0 text-red-400" />}
                  {!p.camOn && <VideoOff className="size-3.5 shrink-0 text-zinc-500" />}
                  {p.camOn && !p.isSelf && <Video className="size-3.5 shrink-0 text-emerald-400" />}
                  {!p.isSelf && getPeerVolume(p.sessionId) <= 0 && (
                    <VolumeX className="size-3.5 shrink-0 text-red-400" />
                  )}
                </div>
              </ContextMenuTrigger>
              {!p.isSelf && (
                <ContextMenuContent className="ordex-panel-2 w-56 border-white/10">
                  <ContextMenuLabel className="text-xs text-zinc-400">
                    {p.userName} — kullanıcı sesi
                  </ContextMenuLabel>
                  <div className="px-2 pb-1.5 pt-1">
                    <Slider
                      value={[Math.round(getPeerVolume(p.sessionId) * 100)]}
                      min={0}
                      max={200}
                      step={5}
                      onValueChange={([v]) => setPeerVolume(p.sessionId, v / 100)}
                      className="cursor-pointer [&_[data-slot=slider-range]]:bg-emerald-400 [&_[data-slot=slider-thumb]]:border-emerald-400"
                    />
                    <p className="mt-1 text-center text-[10px] text-zinc-500">
                      %{Math.round(getPeerVolume(p.sessionId) * 100)}
                    </p>
                  </div>
                  <ContextMenuSeparator className="bg-white/10" />
                  <ContextMenuItem
                    className="text-xs focus:bg-white/10"
                    onSelect={() => setPeerVolume(p.sessionId, 1)}
                  >
                    <Volume2 className="size-3.5" /> Varsayılan (%100)
                  </ContextMenuItem>
                  <ContextMenuItem
                    className="text-xs focus:bg-white/10"
                    onSelect={() => setPeerVolume(p.sessionId, 0)}
                  >
                    <VolumeX className="size-3.5" /> Yerel olarak sustur (%0)
                  </ContextMenuItem>
                </ContextMenuContent>
              )}
            </ContextMenu>
          ))}
        </div>

        {/* Room members (not in voice) */}
        <p className="flex items-center gap-1.5 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <Users className="size-3.5" /> Odada ({participants.length})
        </p>
        <div className="space-y-1">
          {participants.map((p) => (
            <div key={p.sessionId} className="flex items-center gap-2 px-2 py-1">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ background: `hsl(${p.avatarHue} 65% 45%)` }}
              >
                {initials(p.userName)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                {p.userName}
              </span>
              {p.inVoice && (
                <span title="Sesli kanalda">
                  <Volume2 className="size-3 shrink-0 text-emerald-400" />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Voice controls — synced with 1:1 calls: while a call rings or runs,
          the join button swaps for an end-call card so the two bottom panels
          can never fight for the same mic/UI state. */}
      <VoiceFooter
        inVoice={inVoice}
        micOn={micOn}
        camOn={camOn}
        krisp={krisp}
        onToggleKrisp={onToggleKrisp}
        onJoinVoice={onJoinVoice}
        onLeaveVoice={onLeaveVoice}
        onToggleMic={onToggleMic}
        onToggleCam={onToggleCam}
      />
      <p className="-mt-1 pb-2 text-center text-[10px] text-zinc-600">
        {user?.name ?? "Misafir"} olarak bağlısın
      </p>
    </aside>
  );
}

/**
 * Bottom card of the right panel. Reads the global 1:1 call state:
 * - call ringing/active → red/amber end-call card (join is blocked)
 * - otherwise → normal voice channel join/controls
 * Both panels switch in the same render pass, so they always agree.
 */
function VoiceFooter({
  inVoice,
  micOn,
  camOn,
  krisp,
  onToggleKrisp,
  onJoinVoice,
  onLeaveVoice,
  onToggleMic,
  onToggleCam,
}: Pick<
  RightPanelProps,
  | "inVoice"
  | "micOn"
  | "camOn"
  | "krisp"
  | "onToggleKrisp"
  | "onJoinVoice"
  | "onLeaveVoice"
  | "onToggleMic"
  | "onToggleCam"
>) {
  const call = useCallState();

  if (call.active) {
    return (
      <div className="border-t border-white/5 bg-[var(--ordex-panel-2)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20",
              call.ringing && "animate-pulse",
            )}
          >
            <Phone className="size-3.5 text-amber-400" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-xs font-semibold text-zinc-100">
              {call.peerName || "Arama"}
            </span>
            <span className="block text-[10px] text-amber-300/90">
              {call.ringing ? "Aranıyor... sesli kanal kilitli" : "Görüşme sürüyor"}
            </span>
          </span>
          <Button
            size="icon"
            className="size-8 shrink-0 bg-red-600 text-white hover:bg-red-500"
            title={call.ringing ? "Aramayı reddet" : "Aramayı bitir"}
            onClick={endActiveCall}
          >
            <PhoneOff className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-white/5 bg-[var(--ordex-panel-2)] p-3">
      {inVoice ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant={micOn ? "secondary" : "destructive"}
              className="size-9 shrink-0"
              title={micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
              onClick={onToggleMic}
            >
              {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant={camOn ? "secondary" : "destructive"}
              className="size-9 shrink-0"
              title={camOn ? "Kamerayı kapat" : "Kamerayı aç"}
              onClick={onToggleCam}
            >
              {camOn ? <Video className="size-4" /> : <VideoOff className="size-4" />}
            </Button>
            <Button
              onClick={onLeaveVoice}
              variant="destructive"
              className="h-9 flex-1 text-xs"
            >
              Kanaldan ayrıl
            </Button>
          </div>
          {/* Krisp-style noise suppression toggle */}
          <button
            type="button"
            onClick={onToggleKrisp}
            className={cn(
              "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors",
              krisp
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10",
            )}
            title="Krisp tarzı gürültü engelleme: yankı + ortam sesi filtreleri"
          >
            <AudioLines className={cn("size-3.5 shrink-0", krisp && "text-emerald-400")} />
            <span className="min-w-0 flex-1 leading-tight">
              Krisp Gürültü Engelleme
              <span className="block text-[9px] text-zinc-500">
                {krisp ? "Açık — yankı ve gürültü filtreleniyor" : "Kapalı — ham mikrofon"}
              </span>
            </span>
            <span
              className={cn(
                "flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors",
                krisp ? "bg-emerald-500" : "bg-zinc-600",
              )}
            >
              <span
                className={cn(
                  "size-3 rounded-full bg-white transition-transform",
                  krisp && "translate-x-3",
                )}
              />
            </span>
          </button>
        </div>
      ) : (
        <Button
          onClick={onJoinVoice}
          className="h-9 w-full gap-2 bg-[var(--ordex-accent)] text-xs text-white hover:bg-[var(--ordex-accent-hover)]"
        >
          <Headphones className="size-4" /> Sesli kanala katıl
        </Button>
      )}
    </div>
  );
}
