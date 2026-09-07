import type { YouTubeSync } from "@/hooks/use-youtube-sync";
import { cn } from "@/lib/utils";
import { formatTime, parseYouTube } from "@/lib/utils-room";
import { Link2, Loader2, MonitorPlay, Pause, Play, Radio, SkipForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

interface MediaPanelProps {
  roomName: string;
  roomCode: string;
  sync: YouTubeSync;
  onAddLink: (videoId: string) => void;
  onNext: () => void;
  localStream: MediaStream | null;
  camOn: boolean;
}

export function MediaPanel({
  roomName,
  roomCode,
  sync,
  onAddLink,
  onNext,
  localStream,
  camOn,
}: MediaPanelProps) {
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const videoId = parseYouTube(link);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Attach the local camera preview.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (localStream) {
      el.srcObject = localStream;
      void el.play().catch(() => undefined);
    } else {
      el.srcObject = null;
    }
  }, [localStream]);

  const submit = () => {
    if (!videoId) {
      setLinkError("Geçerli bir YouTube linki gir.");
      return;
    }
    setLinkError(null);
    setLink("");
    onAddLink(videoId);
  };

  // Copy invite link.
  const copyInvite = () => {
    void navigator.clipboard
      .writeText(`${window.location.origin}/room/${roomCode}`)
      .catch(() => undefined);
  };

  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-[#0b0c0e]">
      {/* Player area */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
        <div className="relative aspect-video max-h-full w-full max-w-full">
          {sync.hasVideo ? (
            <div ref={sync.containerRef} className="absolute inset-0 size-full" />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-14 items-center justify-center rounded-2xl bg-red-600/15 text-red-500">
                <MonitorPlay className="size-7" />
              </span>
              <p className="text-sm font-medium text-zinc-300">Henüz video yok</p>
              <p className="max-w-xs text-xs text-zinc-600">
                Aşağıya bir YouTube linki yapıştır — odadaki herkeste aynı anda, senkron oynar.
              </p>
            </div>
          )}
          {sync.hasVideo && !sync.ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
          )}
        </div>

        {/* Local camera preview (self view) */}
        {localStream && camOn && (
          <video
            ref={videoRef}
            muted
            playsInline
            className="absolute right-3 top-3 z-10 h-24 w-32 rounded-md border border-white/20 bg-black object-cover shadow-lg"
          />
        )}

        {/* Live badge */}
        {sync.hasVideo && sync.playing && (
          <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <Radio className="size-3" /> Senkron
          </span>
        )}
      </div>

      {/* Custom media bar */}
      <div className="border-t border-white/5 bg-[#131518] px-3 py-2">
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
            className="min-w-0 flex-1 cursor-pointer [&_[data-slot=slider-range]]:bg-red-600 [&_[data-slot=slider-thumb]]:border-red-600"
          />
          <span className="w-11 shrink-0 font-mono text-[10px] text-zinc-500">
            {formatTime(sync.duration)}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            className="size-9 shrink-0 bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
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
                placeholder="YouTube linki gir ve herkeste başlat..."
                className="h-9 border-white/10 bg-black/30 pl-8 text-xs placeholder:text-zinc-600 focus-visible:ring-red-500/40"
              />
            </div>
            <Button
              size="sm"
              onClick={submit}
              disabled={!link.trim()}
              className={cn(
                "h-9 shrink-0 bg-red-600 px-3 text-xs text-white hover:bg-red-500",
                videoId && "bg-emerald-600 hover:bg-emerald-500",
              )}
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
