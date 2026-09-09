import type { MediaSync } from "@/hooks/use-media-sync";
import { cn } from "@/lib/utils";
import { formatTime, parseMediaLink, type ParsedMediaLink } from "@/lib/utils-room";
import {
  Link2,
  Loader2,
  Maximize,
  Minimize,
  MonitorPlay,
  PanelLeftClose,
  PanelRightClose,
  Pause,
  Play,
  Radio,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface MediaPanelProps {
  roomName: string;
  roomCode: string;
  sync: MediaSync;
  /** React wrapper that permanently hosts the YouTube iframe (YT API replaces its child node). */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Disposable inner host the YT iframe actually mounts into (kept out of React's tree). */
  ytHostRef: RefObject<HTMLDivElement | null>;
  /** HTML5 <video> element for direct files (always mounted). */
  videoRef: RefObject<HTMLVideoElement | null>;
  onAddLink: (media: ParsedMediaLink) => void;
  onNext: () => void;
  localStream: MediaStream | null;
  camOn: boolean;
  cinemaMode: boolean;
  onToggleCinema: () => void;
}

export function MediaPanel({
  roomName,
  roomCode,
  sync,
  stageRef,
  ytHostRef,
  videoRef,
  onAddLink,
  onNext,
  localStream,
  camOn,
  cinemaMode,
  onToggleCinema,
}: MediaPanelProps) {
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const parsed = link.trim() ? parseMediaLink(link) : null;
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Fullscreen state sync (e.g. user exits with Esc).
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void stage.requestFullscreen().catch(() =>
        setLinkError("Tam ekran isteği reddedildi."),
      );
    }
  };

  // Attach the local camera preview.
  useEffect(() => {
    const el = videoPreviewRef.current;
    if (!el) return;
    if (localStream && camOn) {
      el.srcObject = localStream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [localStream, camOn]);

  const submit = () => {
    const media = parseMediaLink(link);
    if (!media) {
      setLinkError("Geçerli bir link gir (YouTube veya doğrudan mp4/webm).");
      return;
    }
    setLinkError(null);
    setLink("");
    onAddLink(media);
  };

  // Copy invite link.
  const copyInvite = () => {
    void navigator.clipboard
      .writeText(`${window.location.origin}/room/${roomCode}`)
      .catch(() => undefined);
  };

  const isDirect = sync.mediaType === "direct";

  return (
    <section className="ordex-bg flex h-full min-h-0 w-full flex-col">
      {/* Player area */}
      <div
        ref={stageRef}
        className="ordex-fs-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
      >
        <div className="relative aspect-video max-h-full w-full max-w-full max-md:max-h-[56vw]">
          {/* YouTube host — always mounted. The YT API mounts its iframe inside
              a disposable inner div created by use-media-sync; React never
              owns the swapped node, so the virtual DOM stays consistent.
              This host lives INSIDE the 16:9 box so the iframe is properly
              sized/positioned and hidden when a direct video takes over.
              NOTE: the stage ref lives on the outer player-area div only —
              a second ref here used to double-bind the same node. */}
          <div
            ref={ytHostRef}
            className={cn("absolute inset-0 size-full [&_iframe]:size-full", isDirect && "invisible")}
          />
          {/* Direct HTML5 video — always mounted; only visible for direct files. */}
          <video
            ref={videoRef}
            playsInline
            controls={false}
            className={cn(
              "absolute inset-0 size-full bg-black object-contain",
              !isDirect && "invisible",
            )}
          />
          {!sync.hasVideo && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-red-600/15 text-red-500">
                <MonitorPlay className="size-7" />
              </span>
              <p className="text-sm font-medium text-zinc-300">Henüz video yok</p>
              <p className="max-w-xs text-xs text-zinc-600">
                Aşağıya bir YouTube veya doğrudan video linki yapıştır — odadaki herkeste aynı anda, senkron oynar.
              </p>
            </div>
          )}
        </div>
          {sync.hasVideo && !sync.ready && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60">
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
          )}

        {/* Local camera preview (self view) — offset below the overlay buttons */}
        {localStream && (
          <video
            ref={videoPreviewRef}
            muted
            playsInline
            className={cn(
              "absolute right-3 top-14 z-10 h-24 w-32 rounded-md border border-white/20 bg-black object-cover shadow-lg",
              !camOn && "hidden",
            )}
          />
        )}

        {/* Live badge */}
        {sync.hasVideo && sync.playing && (
          <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-[var(--ordex-accent)]/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Radio className="size-3" /> Senkron
          </span>
        )}

        {/* Stage overlay buttons: cinema toggle + fullscreen */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5">
          <Button
            size="icon"
            variant="secondary"
            className="size-8 bg-black/60 text-zinc-300 backdrop-blur hover:bg-black/80"
            title={cinemaMode ? "Panelleri göster" : "Sinema modu (panelleri gizle)"}
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
            {isFullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Custom media bar */}
      <div className="ordex-panel border-t border-white/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-right font-mono text-[10px] text-zinc-500">
            {formatTime(sync.currentTime)}
          </span>
          <Slider
            value={[Math.min(sync.currentTime, sync.duration || 1)]}
            max={sync.duration || 1}
            step={1}
            onValueChange={([v]) => sync.seek(v)}
            disabled={!sync.hasVideo || !sync.ready}
            className="min-w-0 flex-1 cursor-pointer [&_[data-slot=slider-range]]:bg-[var(--ordex-accent)] [&_[data-slot=slider-thumb]]:border-[var(--ordex-accent)]"
          />
          <span className="w-11 shrink-0 font-mono text-[10px] text-zinc-500">
            {formatTime(sync.duration)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="icon"
              className="size-9 shrink-0 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)] disabled:opacity-40"
              title={sync.playing ? "Duraklat" : "Oynat"}
              disabled={!sync.hasVideo || !sync.ready}
              onClick={() => (sync.playing ? sync.pause() : sync.play())}
            >
              {sync.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0 bg-white/10 text-zinc-200 hover:bg-white/15"
              title="Sıradaki videoya geç"
              onClick={onNext}
            >
              <SkipForward className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-9 shrink-0 bg-white/10 text-zinc-200 hover:bg-white/15"
              title={sync.muted ? "Sesi aç" : "Sessize al"}
              onClick={sync.toggleMute}
            >
              {sync.muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
          </div>
          <Slider
            value={[sync.muted ? 0 : sync.volume]}
            max={100}
            step={1}
            onValueChange={([v]) => sync.setVolume(v)}
            className="w-24 shrink-0 cursor-pointer [&_[data-slot=slider-range]]:bg-zinc-300 [&_[data-slot=slider-thumb]]:border-zinc-300"
          />

          {/* Direct link input */}
          <div className="flex min-w-52 flex-1 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Link2 className="absolute left-2.5 top-2.5 size-3.5 text-zinc-600" />
              <Input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="YouTube veya mp4/tau-video linki gir..."
                className="h-9 border-white/10 bg-black/30 pl-8 text-xs placeholder:text-zinc-600 focus-visible:ring-[var(--ordex-accent)]/40"
              />
            </div>
            <Button
              size="sm"
              onClick={submit}
              disabled={!link.trim()}
              className={cn(
                "h-9 shrink-0 bg-[var(--ordex-accent)] px-3 text-xs text-white hover:bg-[var(--ordex-accent-hover)]",
                parsed && "bg-emerald-600 hover:bg-emerald-500",
              )}
              title={parsed ? (parsed.type === "youtube" ? "YouTube olarak oynat" : "Doğrudan video olarak oynat") : undefined}
            >
              Oynat
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 border-white/10 bg-black/20 px-2 text-xs hover:bg-white/5"
              title="Davet linkini kopyala"
              onClick={copyInvite}
            >
              Davet
            </Button>
          </div>
        </div>
        {linkError && <p className="mt-1.5 text-[11px] text-red-400">{linkError}</p>}
        <p className="mt-1.5 truncate text-[10px] text-zinc-600">
          {roomName} · kod <span className="font-mono tracking-widest text-zinc-400">{roomCode}</span>
        </p>
      </div>
    </section>
  );
}
