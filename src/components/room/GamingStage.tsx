import { cn } from "@/lib/utils";
import {
  Headphones,
  Maximize,
  Mic,
  MicOff,
  MonitorUp,
  PanelLeftClose,
  PanelRightClose,
  PhoneOff,
  Radio,
  Square,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { VoiceParticipant } from "@/hooks/use-voice";
import { endActiveCall, useCallState } from "@/components/social/SocialOverlay";

interface GamingStageProps {
  roomName: string;
  roomCode: string;
  participants: VoiceParticipant[];
  inVoice: boolean;
  micOn: boolean;
  isSharing: boolean;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  /** 🖥️ Live display-capture stream for the sharer's own preview. */
  screenStream?: MediaStream | null;
  /** 🖥️ Screen-share specific error surface. */
  screenShareError?: string | null;
  onJoinVoice: () => void;
  onLeaveVoice: () => void;
  onToggleMic: () => void;
  onStartShare: () => void;
  onStopShare: () => void;
  cinemaMode: boolean;
  onToggleCinema: () => void;
}

/**
 * Gaming room stage: one user broadcasts their screen/game via getDisplayMedia
 * and WebRTC; everyone else watches (and can fullscreen) the live stream.
 */
export function GamingStage({
  roomName,
  roomCode,
  participants,
  inVoice,
  micOn,
  isSharing,
  localStream,
  remoteStreams,
  screenStream,
  screenShareError,
  onJoinVoice,
  onLeaveVoice,
  onToggleMic,
  onStartShare,
  onStopShare,
  cinemaMode,
  onToggleCinema,
}: GamingStageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 1:1 call status (global) — swaps the voice join button for an end-call
  // button while a call rings or runs, so both bottom panels stay in sync.
  const callState = useCallState();

  // Fullscreen state sync (user can exit with Esc).
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Attach the sharer's own preview.
  // 🖥️ Fix: the preview attaches to the DISPLAY-CAPTURE stream — localStream
  // only carries the mic while sharing, so binding to it showed a frozen/
  // black frame. muted is mandatory (loopback would echo your own audio).
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    if (isSharing && screenStream) {
      el.srcObject = screenStream;
      el.muted = true; // hard guarantee: no self-echo from the preview
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [isSharing, screenStream]);

  // Attach the live broadcast from whoever is sharing (any participant).
  useEffect(() => {
    const el = remoteRef.current;
    if (!el) return;
    const stream = [...remoteStreams.values()].find((s) => s.getVideoTracks().length > 0) ?? null;
    if (stream) {
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [remoteStreams]);

  const sharer = participants.find((p) => p.isSharing);
  const watching = Boolean(sharer && !sharer.isSelf) || [...remoteStreams.values()].some((s) => s.getVideoTracks().length > 0);

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void stage.requestFullscreen().catch(() => undefined);
    }
  };

  return (
    <section className="ordex-bg flex h-full min-h-0 w-full flex-col">
      {/* Broadcast stage */}
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
      >
        {/* Remote broadcast (viewers) */}
        <video
          ref={remoteRef}
          playsInline
          autoPlay
          muted
          className={cn("ordex-screen-video absolute inset-0 size-full object-contain", !watching && "invisible")}
        />
        {/* Sharer self-preview */}
        <video
          ref={previewRef}
          muted
          playsInline
          autoPlay
          className={cn(
            "ordex-screen-video absolute right-3 top-24 z-10 h-24 w-40 rounded-md border border-white/20 bg-black object-contain shadow-lg",
            (!isSharing || !screenStream) && "hidden",
          )}
        />

        {/* Empty state */}
        {!watching && !isSharing && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ordex-accent)]/15 text-[var(--ordex-accent)]">
              <MonitorUp className="size-7" />
            </span>
            <p className="text-sm font-medium text-zinc-300">Yayın yok</p>
            <p className="max-w-xs text-xs text-zinc-600">
              Ekranını veya oyununu tek tıkla yayınlamaya başla — odadaki herkes izleyebilir.
            </p>
          </div>
        )}

        {/* Live badge */}
        {(watching || isSharing) && (
          <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-[var(--ordex-accent)]/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Radio className="size-3" /> {isSharing ? "Yayındasın" : `${sharer?.userName ?? "Biri"} yayınlıyor`}
          </span>
        )}

        {/* Stage overlay buttons (below the fixed Leave Room chip) */}
        <div className="absolute right-3 top-14 z-20 flex items-center gap-1.5">
          <Button
            size="icon"
            variant="secondary"
            className="size-8 bg-black/60 text-zinc-300 backdrop-blur hover:bg-black/80"
            title={cinemaMode ? "Panelleri göster" : "Panelleri gizle"}
            onClick={onToggleCinema}
          >
            {cinemaMode ? <PanelRightClose className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="size-8 bg-black/60 text-zinc-300 backdrop-blur hover:bg-black/80"
            title={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Maximize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Broadcast + voice control bar */}
      <div className="ordex-panel border-t border-white/5 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* 🖥️ Single toggle: green/active while the broadcast is live. */}
          <Button
            onClick={isSharing ? onStopShare : onStartShare}
            className={cn(
              "h-9 shrink-0 gap-2 text-xs font-medium text-white transition-colors",
              isSharing
                ? "bg-emerald-500 hover:bg-emerald-400"
                : "bg-[var(--ordex-accent)] hover:bg-[var(--ordex-accent-hover)]",
            )}
            title={isSharing ? "Yayını durdur" : "Ekran / oyun yayını başlat"}
          >
            {isSharing ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-white" />
                </span>
                Yayındasın
              </>
            ) : (
              <>
                <MonitorUp className="size-4" /> Ekranı Paylaş
              </>
            )}
          </Button>

          <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />

          {inVoice ? (
            <>
              <Button
                size="icon"
                variant={micOn ? "secondary" : "destructive"}
                className="size-9 shrink-0"
                title={micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
                onClick={onToggleMic}
              >
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </Button>
              <Button onClick={onLeaveVoice} variant="outline" className="ordex-inset h-9 shrink-0 border-white/10 text-xs hover:bg-[var(--ordex-panel-3)]">
                Sesli kanaldan ayrıl
              </Button>
            </>
          ) : callState.active ? (
            /* 1:1 call in progress: join is blocked and mirrored as end-call,
               keeping this bar in sync with the bottom-left call card. */
            <Button
              onClick={endActiveCall}
              variant="outline"
              className="h-9 shrink-0 gap-2 border-red-500/40 bg-red-500/10 text-xs text-red-300 hover:bg-red-500/20"
              title={callState.ringing ? "Aramayı reddet" : "Aramayı bitir"}
            >
              <PhoneOff className="size-4" />
              {callState.ringing ? "Aramayı reddet" : "Aramayı bitir"}
            </Button>
          ) : (
            <Button
              onClick={onJoinVoice}
              variant="outline"
              className="ordex-inset h-9 shrink-0 gap-2 border-white/10 text-xs hover:bg-[var(--ordex-panel-3)]"
            >
              <Headphones className="size-4" /> Sesli kanala katıl
            </Button>
          )}

          <span className="ml-auto truncate text-[10px] text-zinc-600">
            {roomName} · kod <span className="font-mono tracking-widest text-zinc-400">{roomCode}</span>
          </span>
        </div>

        {/* Watchers strip */}
        {participants.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-600">
              <Users className="size-3" /> Kanaldakiler:
            </span>
            {participants.map((p) => (
              <span
                key={p.sessionId}
                className="ordex-chip flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] text-zinc-300"
              >
                {p.micOn ? <Mic className="size-2.5 text-emerald-400" /> : <MicOff className="size-2.5 text-red-400" />}
                {p.isSharing ? <MonitorUp className="size-2.5 text-[var(--ordex-accent)]" /> : null}
                {p.userName}
                {p.isSelf && <span className="text-zinc-600">(sen)</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
