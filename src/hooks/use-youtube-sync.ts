import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---- YouTube IFrame API bootstrap ----

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
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

export interface RoomMediaState {
  currentVideoId?: string;
  isPlaying: boolean;
  positionSec: number;
  mediaUpdatedAt: number;
  mediaUpdatedBy: string;
}

export interface UseYouTubeSyncOptions {
  roomId: Id<"rooms">;
  sessionId: string;
  onEnded: (finishedVideoId: string) => void;
}

export interface YouTubeSync {
  playerRef: React.RefObject<HTMLDivElement | null>;
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffering: boolean;
  volume: number;
  muted: boolean;
  hasVideo: boolean;
  loadVideo: (videoId: string) => void;
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

const SYNC_BIAS_MS = 150; // clock/latency compensation toward the controller's position
const HARD_RESYNC_MS = 4000; // drift beyond this triggers a seek

export function useYouTubeSync({
  roomId,
  sessionId,
  onEnded,
}: UseYouTubeSyncOptions): YouTubeSync {
  const setMedia = useMutation(api.rooms.setMedia);
  const advanceQueue = useMutation(api.rooms.advanceQueue);

  const mediaState = useQuery(api.rooms.getMedia, { roomId });
  const state = mediaState as RoomMediaState | undefined;

  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const applyingRef = useRef(false); // true while applying a remote change (don't echo back)
  const lastAppliedRef = useRef<string>("");
  const lastSentRef = useRef(0);
  const endedFiredRef = useRef<string>("");

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [volume, setVolumeState] = useState(70);
  const [muted, setMuted] = useState(false);

  // ---- Player lifecycle ----
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
              readyRef.current = true;
              player.setVolume(volume);
              setReady(true);
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
                if (finished) onEndedRef.current(finished);
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
      readyRef.current = false;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // ---- Apply remote state ----
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current || !state?.currentVideoId) return;
    const key = `${state.currentVideoId}|${state.isPlaying}|${state.positionSec.toFixed(2)}|${state.mediaUpdatedAt}`;
    if (key === lastAppliedRef.current) return;
    lastAppliedRef.current = key;

    const target = Math.max(
      0,
      state.positionSec + (state.isPlaying ? (Date.now() - state.mediaUpdatedAt) / 1000 : 0) - SYNC_BIAS_MS / 1000,
    );
    applyingRef.current = true;
    try {
      const currentId = player.getVideoData?.()?.video_id;
      if (currentId !== state.currentVideoId) {
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
  }, [state?.currentVideoId, state?.isPlaying, state?.positionSec, state?.mediaUpdatedAt, ready]);

  // ---- Publish local intent ----
  const publish = useCallback(
    (videoId: string, isPlaying: boolean, positionSec: number) => {
      const now = Date.now();
      if (now - lastSentRef.current < 700) return; // throttle
      lastSentRef.current = now;
      void setMedia({
        roomId,
        videoId,
        isPlaying,
        positionSec,
        sessionId,
      });
    },
    [roomId, sessionId, setMedia],
  );

  // ---- Progress ticker ----
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      try {
        const t = player.getCurrentTime();
        const d = player.getDuration();
        setCurrentTime(t);
        if (d > 0) setDuration(d);
        const s = player.getPlayerState();
        if (s === 1 && !applyingRef.current) {
          publish(player.getVideoData().video_id, true, t);
        }
      } catch {
        /* player not ready yet */
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [publish, ready]);

  // ---- Controls ----
  const loadVideo = useCallback(
    (videoId: string) => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      applyingRef.current = true;
      player.loadVideoById({ videoId, startSeconds: 0 });
      setTimeout(() => {
        applyingRef.current = false;
      }, 400);
      void setMedia({ roomId, videoId, isPlaying: true, positionSec: 0, sessionId });
    },
    [roomId, sessionId, setMedia],
  );

  const play = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    player.playVideo();
    publish(player.getVideoData().video_id, true, player.getCurrentTime());
  }, [publish]);

  const pause = useCallback(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    player.pauseVideo();
    publish(player.getVideoData().video_id, false, player.getCurrentTime());
  }, [publish]);

  const seek = useCallback(
    (seconds: number) => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;
      player.seekTo(seconds, true);
      const wasPlaying = player.getPlayerState() === 1;
      setCurrentTime(seconds);
      if (wasPlaying) player.playVideo();
      publish(player.getVideoData().video_id, wasPlaying, seconds);
    },
    [publish],
  );

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (v > 0) setMuted(false);
    playerRef.current?.setVolume(v);
    if (v > 0) playerRef.current?.unMute();
  }, []);

  const toggleMute = useCallback(() => {
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
  }, [muted, volume]);

  return {
    playerRef,
    ready,
    playing,
    currentTime,
    duration,
    buffering,
    volume,
    muted,
    hasVideo: Boolean(state?.currentVideoId),
    loadVideo,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
  };
}
