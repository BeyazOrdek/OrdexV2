import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---- YouTube IFrame API bootstrap ----

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { video_id: string; title: string };
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void;
  cueVideoById(opts: { videoId: string; startSeconds?: number }): void;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement | string,
    config: {
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: {
    UNSTARTED: number;
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
  };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
      else reject(new Error("YT API hazır ama bulunamadı"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("YouTube IFrame API yüklenemedi"));
    document.head.appendChild(script);
    setTimeout(() => {
      if (!window.YT?.Player) reject(new Error("YouTube IFrame API zaman aşımı"));
    }, 15000);
  });
  return apiPromise;
}

// ---- Types ----

export type MediaType = "youtube" | "direct";

export interface RoomMediaState {
  currentVideoId?: string;
  mediaType?: MediaType;
  mediaUrl?: string;
  isPlaying: boolean;
  positionSec: number;
  mediaUpdatedAt: number;
  mediaUpdatedBy: string;
}

export interface UseMediaSyncOptions {
  roomId: Id<"rooms">;
  sessionId: string;
  onEnded: (mediaKey: string) => void;
}

export interface MediaSync {
  /** Host node replaced by the YouTube iframe (always mounted). */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** HTML5 <video> element for direct files — the panel renders it (always mounted). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaType: MediaType | null;
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffering: boolean;
  volume: number;
  muted: boolean;
  hasVideo: boolean;
  currentVideoId?: string;
  mediaUrl?: string;
  endedMediaKey?: string;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

const SYNC_BIAS_MS = 150; // clock/latency compensation toward the controller's position
const HARD_RESYNC_MS = 4000; // drift beyond this triggers a seek

/** Try to play; if autoplay is blocked, retry on the next user gesture. */
function playWithAutoplayGuard(el: HTMLMediaElement) {
  el.play().catch((err: unknown) => {
    console.log("Autoplay bekleniyor:", err);
    const resume = () => {
      void el.play().catch(() => undefined);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
  });
}

/** Seek as soon as the element has metadata (direct videos need this after src swap). */
function seekWhenReady(video: HTMLVideoElement, t: number) {
  if (video.readyState >= 1) {
    video.currentTime = t;
    return;
  }
  const onMeta = () => {
    video.removeEventListener("loadedmetadata", onMeta);
    video.currentTime = t;
  };
  video.addEventListener("loadedmetadata", onMeta);
}

export function useMediaSync({
  roomId,
  sessionId,
  onEnded,
}: UseMediaSyncOptions): MediaSync {
  const setMedia = useMutation(api.rooms.setMedia);

  const mediaState = useQuery(api.rooms.getMedia, { roomId });
  const state = mediaState as RoomMediaState | undefined;

  const mediaType: MediaType | null = state?.currentVideoId
    ? (state.mediaType ?? "youtube") // legacy rows without mediaType are YouTube
    : null;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const ytReadyRef = useRef(false);
  const applyingRef = useRef(false); // true while applying a remote change (don't echo back)
  const ytAppliedRef = useRef("");
  const directAppliedRef = useRef("");
  const lastSentRef = useRef(0);
  const endedFiredRef = useRef("");
  const mediaKeyRef = useRef<string | undefined>(undefined);

  const [ytReady, setYtReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolumeState] = useState(70);
  const [muted, setMuted] = useState(false);
  const [endedMediaKey, setEndedMediaKey] = useState<string | undefined>(undefined);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const publish = useCallback(
    (videoId: string, mediaType: MediaType, mediaUrl: string | undefined, isPlaying: boolean, positionSec: number, force = false) => {
      const now = Date.now();
      if (!force && now - lastSentRef.current < 700) return; // throttle background ticks
      lastSentRef.current = now;
      void setMedia({
        roomId,
        videoId,
        mediaType,
        mediaUrl,
        isPlaying,
        positionSec,
        sessionId,
      });
    },
    [roomId, sessionId, setMedia],
  );

  mediaKeyRef.current = state?.currentVideoId;

  // ---- YouTube player lifecycle ----
  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        player = new YT.Player(hostRef.current, {
          videoId: "",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled || !player) return;
              ytReadyRef.current = true;
              player.setVolume(volume);
              setYtReady(true);
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const s = event.data;
              setBuffering(s === 3);
              if (s === 1) setPlaying(true);
              if (s === 2) setPlaying(false);
              if (s === 0) {
                setPlaying(false);
                const finished = playerRef.current?.getVideoData?.()?.video_id;
                if (finished && endedFiredRef.current !== finished) {
                  endedFiredRef.current = finished;
                  onEndedRef.current(finished);
                  setEndedMediaKey(finished);
                }
              }
            },
          },
        });
        playerRef.current = player;
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
      // Full teardown: destroy the player and clean the DOM so audio stops.
      try {
        playerRef.current?.destroy();
      } catch {
        /* already destroyed */
      }
      playerRef.current = null;
      ytReadyRef.current = false;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Handoff between engines: never let two sources play at once ----
  useEffect(() => {
    if (mediaType !== "direct") return;
    // YouTube is hidden while a direct file owns the stage — stop it so its
    // audio cannot leak through.
    try {
      playerRef.current?.stopVideo();
    } catch {
      /* player not ready */
    }
  }, [mediaType, state?.currentVideoId]);

  // ---- Apply remote state: YouTube engine ----
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !ytReadyRef.current || mediaType !== "youtube" || !state?.currentVideoId) return;
    const key = `${state.currentVideoId}|${state.isPlaying}|${state.positionSec.toFixed(2)}|${state.mediaUpdatedAt}`;
    if (key === ytAppliedRef.current) return;
    ytAppliedRef.current = key;
    directAppliedRef.current = "";

    const target = Math.max(
      0,
      state.positionSec + (state.isPlaying ? (Date.now() - state.mediaUpdatedAt) / 1000 : 0) - SYNC_BIAS_MS / 1000,
    );
    applyingRef.current = true;
    try {
      const currentId = player.getVideoData?.()?.video_id;
      if (currentId !== state.currentVideoId) {
        setEndedMediaKey(undefined);
        endedFiredRef.current = "";
        if (state.isPlaying) {
          player.loadVideoById({ videoId: state.currentVideoId, startSeconds: target });
        } else {
          player.cueVideoById({ videoId: state.currentVideoId, startSeconds: target });
        }
      } else {
        const now = player.getCurrentTime();
        const drift = Math.abs(now - target);
        if (state.isPlaying) {
          if (drift > HARD_RESYNC_MS / 1000) {
            player.seekTo(target, true);
            player.playVideo();
          } else if (!playing) {
            player.playVideo();
          }
        } else {
          if (drift > 1.5) player.seekTo(target, true);
          player.pauseVideo();
        }
      }
    } finally {
      setTimeout(() => {
        applyingRef.current = false;
      }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentVideoId, state?.mediaType, state?.isPlaying, state?.positionSec, state?.mediaUpdatedAt, ytReady, mediaType]);

  // ---- Apply remote state: direct (HTML5) engine ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mediaType !== "direct" || !state?.currentVideoId || !state.mediaUrl) {
      // Make sure no stale direct source keeps playing audio in the background.
      if (video.src || video.dataset.src) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        delete video.dataset.src;
      }
      return;
    }
    const key = `${state.mediaUrl}|${state.isPlaying}|${state.positionSec.toFixed(2)}|${state.mediaUpdatedAt}`;
    if (key === directAppliedRef.current) return;
    directAppliedRef.current = key;
    ytAppliedRef.current = "";

    const target = Math.max(
      0,
      state.positionSec + (state.isPlaying ? (Date.now() - state.mediaUpdatedAt) / 1000 : 0) - SYNC_BIAS_MS / 1000,
    );
    applyingRef.current = true;
    try {
      if (video.dataset.src !== state.mediaUrl) {
        // New direct file: swap source, seek to the synced position once metadata lands.
        setEndedMediaKey(undefined);
        endedFiredRef.current = "";
        video.dataset.src = state.mediaUrl;
        video.src = state.mediaUrl;
        video.load();
        seekWhenReady(video, target);
        if (state.isPlaying) playWithAutoplayGuard(video);
        else video.pause();
      } else {
        const drift = Math.abs(video.currentTime - target);
        if (state.isPlaying) {
          if (drift > HARD_RESYNC_MS / 1000) {
            seekWhenReady(video, target);
          }
          if (video.paused) playWithAutoplayGuard(video);
        } else {
          if (drift > 1.5) seekWhenReady(video, target);
          if (!video.paused) video.pause();
        }
      }
    } finally {
      setTimeout(() => {
        applyingRef.current = false;
      }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentVideoId, state?.mediaType, state?.mediaUrl, state?.isPlaying, state?.positionSec, state?.mediaUpdatedAt, mediaType]);

  // ---- Direct video: local event listeners (drive UI + publish intent) ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const isDirect = () => mediaKeyRef.current !== undefined && video.dataset.src !== undefined;
    const onTime = () => {
      if (applyingRef.current) return;
      setCurrentTime(video.currentTime);
      if (!video.paused && isDirect()) {
        publish(mediaKeyRef.current!, "direct", video.dataset.src, true, video.currentTime);
      }
    };
    const onMeta = () => {
      if (isDirect() && Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlay = () => {
      if (applyingRef.current || !isDirect()) return;
      setPlaying(true);
      publish(mediaKeyRef.current!, "direct", video.dataset.src, true, video.currentTime, true);
    };
    const onPause = () => {
      if (applyingRef.current || !isDirect()) return;
      setPlaying(false);
      publish(mediaKeyRef.current!, "direct", video.dataset.src, false, video.currentTime, true);
    };
    const onEnded = () => {
      setPlaying(false);
      if (!isDirect()) return;
      const key = mediaKeyRef.current!;
      if (endedFiredRef.current !== key) {
        endedFiredRef.current = key;
        onEndedRef.current(key);
        setEndedMediaKey(key);
      }
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => setBuffering(false);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publish]);

  // ---- YouTube progress ticker (publish controller position) ----
  useEffect(() => {
    const interval = setInterval(() => {
      if (mediaType === "direct") return; // direct engine publishes from video events
      const player = playerRef.current;
      if (!player || !ytReadyRef.current) return;
      try {
        const t = player.getCurrentTime();
        const d = player.getDuration();
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        const s = player.getPlayerState();
        if (s === 1 && !applyingRef.current) {
          publish(player.getVideoData().video_id, "youtube", undefined, true, t);
        }
      } catch {
        /* player not ready yet */
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [publish, ytReady, mediaType]);

  // ---- Unified controls ----
  const play = useCallback(() => {
    if (mediaType === "direct") {
      const video = videoRef.current;
      if (!video || !video.dataset.src) return;
      playWithAutoplayGuard(video);
      return;
    }
    const player = playerRef.current;
    if (!player || !ytReadyRef.current || !state?.currentVideoId) return;
    player.playVideo();
    publish(player.getVideoData().video_id, "youtube", undefined, true, player.getCurrentTime(), true);
  }, [mediaType, publish, state?.currentVideoId]);

  const pause = useCallback(() => {
    if (mediaType === "direct") {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      return;
    }
    const player = playerRef.current;
    if (!player || !ytReadyRef.current || !state?.currentVideoId) return;
    player.pauseVideo();
    publish(player.getVideoData().video_id, "youtube", undefined, false, player.getCurrentTime(), true);
  }, [mediaType, publish, state?.currentVideoId]);

  const seek = useCallback(
    (seconds: number) => {
      if (mediaType === "direct") {
        const video = videoRef.current;
        if (!video || !video.dataset.src) return;
        seekWhenReady(video, seconds);
        setCurrentTime(seconds);
        publish(mediaKeyRef.current!, "direct", video.dataset.src, !video.paused, seconds, true);
        return;
      }
      const player = playerRef.current;
      if (!player || !ytReadyRef.current || !state?.currentVideoId) return;
      player.seekTo(seconds, true);
      const wasPlaying = player.getPlayerState() === 1;
      if (wasPlaying) player.playVideo();
      setCurrentTime(seconds);
      publish(player.getVideoData().video_id, "youtube", undefined, wasPlaying, seconds, true);
    },
    [mediaType, publish, state?.currentVideoId],
  );

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0) setMuted(false);
    if (mediaType === "direct") {
      const video = videoRef.current;
      if (!video) return;
      video.volume = Math.min(1, Math.max(0, v / 100));
      if (v > 0) video.muted = false;
      return;
    }
    playerRef.current?.setVolume(v);
    if (v > 0) playerRef.current?.unMute();
  }, [mediaType]);

  const toggleMute = useCallback(() => {
    if (mediaType === "direct") {
      const video = videoRef.current;
      if (!video) return;
      video.muted = !video.muted;
      setMuted(video.muted);
      if (!video.muted && video.volume === 0) {
        video.volume = 0.6;
        setVolumeState(60);
      }
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    if (muted) {
      player.unMute();
      player.setVolume(volume || 60);
      setMuted(false);
    } else {
      player.mute();
      setMuted(true);
    }
  }, [mediaType, muted, volume]);

  return {
    containerRef: hostRef,
    videoRef,
    mediaType,
    ready: mediaType === "youtube" ? ytReady : mediaType === "direct",
    playing,
    currentTime,
    duration,
    buffering,
    volume,
    muted,
    hasVideo: Boolean(state?.currentVideoId),
    currentVideoId: state?.currentVideoId,
    mediaUrl: state?.mediaUrl,
    endedMediaKey,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
  };
}
