import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

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
  // Quality / captions controls — optional because not every API build exposes them.
  setPlaybackQuality?(quality: string): void;
  unloadModule?(moduleName: string): void;
  setOption?(moduleName: string, key: string, value: unknown): void;
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
        onApiChange?: () => void;
        onError?: (event: { data: number }) => void;
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
  /** Monotonic op counter bumped by the server on every accepted write. */
  mediaSeq?: number;
}

export interface UseMediaSyncOptions {
  roomId: Id<"rooms">;
  sessionId: string;
  onEnded: (mediaKey: string) => void;
  /** HTML5 <video> element for direct files (always mounted). */
  videoRef: RefObject<HTMLVideoElement | null>;
}

export interface MediaSync {
  /**
   * Callback ref for the disposable YouTube host div. The player (re)mounts
   * whenever the host node attaches — tab switches and panel toggles safe.
   * React owns the div itself; only its children are managed externally.
   */
  ytHostRef: (node: HTMLDivElement | null) => void;
  /**
   * Callback ref for the direct-file <video>. Wraps the caller's ref and
   * re-binds the sync event listeners whenever the element re-attaches
   * (mobile tab switches, panel toggles).
   */
  videoElementRef: (node: HTMLVideoElement | null) => void;
  mediaType: MediaType | null;
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  buffering: boolean;
  /** Player-level failure (YouTube rejected the video / network error). */
  error: string | null;
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

/**
 * Force captions off (auto subs like "[Müzik]") and push the player to its
 * highest available quality. Every call is guarded: these APIs are missing in
 * some player builds and must never throw inside an event handler.
 */
function killCaptionsAndBoostQuality(player: YTPlayer) {
  try {
    player.unloadModule?.("captions");
  } catch {
    /* captions module not loaded */
  }
  try {
    player.setOption?.("captions", "track", {});
  } catch {
    /* captions module not loaded */
  }
  try {
    player.setPlaybackQuality?.("highres");
  } catch {
    /* quality control unsupported */
  }
}

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
  videoRef,
}: UseMediaSyncOptions): MediaSync {
  const setMedia = useMutation(api.rooms.setMedia);

  const mediaState = useQuery(api.rooms.getMedia, { roomId });
  const state = mediaState as RoomMediaState | undefined;

  const mediaType: MediaType | null = state?.currentVideoId
    ? (state.mediaType ?? "youtube") // legacy rows without mediaType are YouTube
    : null;

  const playerRef = useRef<YTPlayer | null>(null);
  /** Disposable host node — set via ytHostRef callback ref, cleared on unmount. */
  const ytHostRefInternal = useRef<HTMLDivElement | null>(null);
  /**
   * Bumped whenever the host node attaches/detaches. The player-lifecycle
   * effect depends on this counter instead of running once, so the player
   * correctly (re)mounts after tab switches / panel toggles — and teardown
   * always runs against a node that is currently in the document.
   */
  const [ytHostVersion, setYtHostVersion] = useState(0);
  const ytHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      ytHostRefInternal.current = node;
      setYtHostVersion((v) => v + 1);
    },
    [],
  );
  /**
   * The HTML5 <video> element re-attaches whenever its panel re-mounts
   * (mobile tab switches, panel toggles). Listeners must re-bind to the new
   * node or the play/pause button silently desyncs from the element — so the
   * binding effect keys off this version counter, not just mount-once.
   */
  const [videoElVersion, setVideoElVersion] = useState(0);
  const videoElementRef = useCallback(
    (node: HTMLVideoElement | null) => {
      videoRef.current = node;
      // A fresh element knows nothing about the current source — clear the
      // applied-state marker so the apply effect re-attaches the media
      // (src + position + play state) immediately on the next commit.
      directAppliedRef.current = "";
      setVideoElVersion((v) => v + 1);
    },
    [videoRef],
  );
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
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(70);
  const [muted, setMuted] = useState(false);
  const [endedMediaKey, setEndedMediaKey] = useState<string | undefined>(undefined);

  // Mirror `onEnded` into a ref inside an effect (refs must not be written
  // during render — the compiler enforces this).
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // Mirror the last-seen media seq into a ref so `publish` stays referentially
  // stable — putting it in the deps would rebuild the 1s ticker every second
  // (the interval would then never actually fire).
  const mediaSeqRef = useRef(0);
  useEffect(() => {
    mediaSeqRef.current = state?.mediaSeq ?? 0;
  }, [state?.mediaSeq]);

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
        // Intent writes bypass the server-side stale-tick guard. Background
        // ticks carry the last seq this client saw, so the server can drop
        // out-of-order ticks that would resurrect an older play/pause state
        // (clock-skew-free ordering).
        force,
        baseMediaSeq: mediaSeqRef.current,
      });
    },
    [roomId, sessionId, setMedia],
  );

  // Mirror the active media key into a ref (in an effect, not during render)
  // so the always-attached HTML5 video event handlers can read the current key.
  useEffect(() => {
    mediaKeyRef.current = state?.currentVideoId;
  }, [state?.currentVideoId]);

  // ---- YouTube player lifecycle (host-driven: (re)mounts with the host node) ----
  useEffect(() => {
    // Reading the counter keeps this effect subscribed to host attach/detach.
    void ytHostVersion;
    let cancelled = false;
    let player: YTPlayer | null = null;
    let mountNode: HTMLDivElement | null = null;
    loadYouTubeApi()
      .then((YT) => {
        const host = ytHostRefInternal.current;
        if (cancelled || !host) return;
        const ytErrorText = (code: number): string => {
          if (code === 101 || code === 150)
            return "Bu video sahibi tarafından dış sitelerde oynatmaya kapatılmış (embed devre dışı).";
          if (code === 100) return "Video bulunamadı — silinmiş veya gizli olabilir.";
          if (code === 2) return "Geçersiz video kimliği.";
          if (code === 5) return "Bu video tarayıcınızda oynatılamıyor (HTML5 oynatıcı hatası).";
          return "Video oynatıcı bir hata verdi.";
        };
        // NEVER hand a React-managed node to the YT API: it *replaces* that
        // node with the iframe, which corrupts React's virtual DOM and makes
        // the next commit crash with "insertBefore ... not a child of this
        // node". Instead we create a disposable inner node that React knows
        // nothing about; the React-owned host div stays mounted forever.
        const mount = document.createElement("div");
        mount.className = "size-full";
        host.appendChild(mount);
        mountNode = mount;
        player = new YT.Player(mount, {
          videoId: "",
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
            // Auto-captions (e.g. the "[Müzik]" auto subs) must NEVER appear.
            cc_load_policy: 0,
            cc_lang_pref: "off",
            iv_load_policy: 3, // no video annotations
            // Ask for the highest stream up front (legacy param, harmless).
            vq: "highres",
            hl: "tr",
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              // Copy into a const first: TS can lose narrowing of the captured
              // `let player` inside nested callbacks, which breaks the type of
              // the killCaptionsAndBoostQuality() argument below.
              const readyPlayer = player;
              if (cancelled || !readyPlayer) return;
              ytReadyRef.current = true;
              readyPlayer.setVolume(volume);
              killCaptionsAndBoostQuality(readyPlayer);
              setYtReady(true);
            },
            onApiChange: () => {
              // Captions modules load lazily per video — kill them again.
              const p = playerRef.current;
              if (cancelled || !p) return;
              killCaptionsAndBoostQuality(p);
            },
            onError: (event) => {
              // Embed-blocked (101/150), deleted (100) etc. videos used to fail
              // SILENTLY — the play button worked but nothing ever played.
              if (cancelled) return;
              setError(ytErrorText(event.data));
            },
            onStateChange: (event) => {
              if (cancelled) return;
              const s = event.data;
              setBuffering(s === 3);
              if (s === 1) {
                setPlaying(true);
                // Playing is the moment YouTube decides on quality + subs.
                const p = playerRef.current;
                if (p) killCaptionsAndBoostQuality(p);
              }
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
      // try/catch wrapper — destroy() throws if the iframe is already gone.
      try {
        playerRef.current?.destroy();
      } catch {
        /* already destroyed */
      }
      playerRef.current = null;
      ytReadyRef.current = false;
      // Reset the readiness STATE too: if the host re-attaches later (tab
      // switches), the new player must flip it false→true again so the
      // apply-state effect re-runs and loads the current video into it.
      setYtReady(false);
      setPlaying(false);
      setBuffering(false);
      // Remove ONLY the disposable mount node this effect created. React owns
      // the host div and all its siblings; wiping the host (or the stage)
      // would tear tracked nodes out of the live DOM and crash the next
      // commit with "insertBefore ... not a child of this node".
      try {
        mountNode?.remove();
      } catch {
        /* already gone */
      }
    };
    // ytHostVersion: re-run when the host node (re)attaches — otherwise the
    // player would stay bound to a detached div after mobile tab switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytHostVersion]);

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
    const key = `${state.currentVideoId}|${state.isPlaying}|${state.positionSec.toFixed(2)}|${state.mediaSeq ?? 0}`;
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
        setError(null); // a fresh video clears a stale player error
        endedFiredRef.current = "";
        // Media switch without destroying the player: load/cue into the
        // existing iframe (keeps React DOM stable, no node replacement).
        if (state.isPlaying) {
          player.loadVideoById({ videoId: state.currentVideoId, startSeconds: target });
        } else {
          player.cueVideoById({ videoId: state.currentVideoId, startSeconds: target });
        }
        killCaptionsAndBoostQuality(player);
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
    const key = `${state.mediaUrl}|${state.isPlaying}|${state.positionSec.toFixed(2)}|${state.mediaSeq ?? 0}`;
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
          // ended counts as paused — replay even when the element reports paused
          if (video.paused || video.ended) playWithAutoplayGuard(video);
        } else {
          const stillPlaying = !video.paused && !video.ended; // play intent on the same element
          if (drift > 1.5) seekWhenReady(video, target);
          if (stillPlaying) video.pause();
        }
      }
    } finally {
      setTimeout(() => {
        applyingRef.current = false;
      }, 400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.currentVideoId, state?.mediaType, state?.mediaUrl, state?.isPlaying, state?.positionSec, state?.mediaUpdatedAt, mediaType, videoElVersion]);

  // ---- Direct video: local event listeners (drive UI + publish intent) ----
  // Runs whenever the element re-attaches (videoElVersion), so listeners are
  // always bound to the CURRENT node — after every remount the element fires
  // a 'pause' event, which must still reach this (now re-bound) handler.
  useEffect(() => {
    void videoElVersion; // re-run on element re-attach
    const video = videoRef.current;
    if (!video) return;
    const isDirect = () => mediaKeyRef.current !== undefined && video.dataset.src !== undefined;
    const onTime = () => {
      setCurrentTime(video.currentTime);
      if (applyingRef.current) return;
      if (!video.paused && isDirect()) {
        publish(mediaKeyRef.current!, "direct", video.dataset.src, true, video.currentTime);
      }
    };
    const onMeta = () => {
      if (isDirect() && Number.isFinite(video.duration)) setDuration(video.duration);
    };
    const onPlay = () => {
      // UI truth first — the button must always reflect the element, even
      // while a remote apply is in flight (otherwise it visually snaps back).
      setPlaying(true);
      if (applyingRef.current || !isDirect()) return;
      publish(mediaKeyRef.current!, "direct", video.dataset.src, true, video.currentTime, true);
    };
    const onPause = () => {
      setPlaying(false);
      if (applyingRef.current || !isDirect()) return;
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
  }, [publish, videoElVersion]);

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
      if (video?.dataset.src) {
        if (video.ended) {
          // Replay from the start (element is stuck at the last frame, paused).
          video.currentTime = 0;
        }
        playWithAutoplayGuard(video);
      } else if (mediaKeyRef.current) {
        // Stage not mounted (mobile tab switch): record the play intent —
        // the apply effect resumes playback when the panel is back.
        publish(mediaKeyRef.current, "direct", state?.mediaUrl, true, video?.currentTime ?? state?.positionSec ?? 0, true);
      }
      return;
    }
    const player = playerRef.current;
    if (!player || !ytReadyRef.current) {
      // Player still warming up: publish the intent so playback starts the
      // moment onReady fires (the apply effect listens on ytReady).
      if (state?.currentVideoId) {
        let pos = state.positionSec;
        try {
          pos = player?.getCurrentTime?.() ?? pos;
        } catch {
          /* not ready yet — fall back to the last synced position */
        }
        publish(state.currentVideoId, "youtube", undefined, true, pos, true);
      }
      return;
    }
    player.playVideo();
    publish(player.getVideoData().video_id, "youtube", undefined, true, player.getCurrentTime(), true);
  }, [mediaType, publish, state?.currentVideoId, state?.positionSec, state?.mediaUrl, videoRef]);

  const pause = useCallback(() => {
    if (mediaType === "direct") {
      const video = videoRef.current;
      video?.pause();
      if (mediaKeyRef.current && (!video || !video.dataset.src)) {
        publish(mediaKeyRef.current, "direct", state?.mediaUrl, false, video?.currentTime ?? state?.positionSec ?? 0, true);
      }
      return;
    }
    const player = playerRef.current;
    if (!player || !ytReadyRef.current) {
      if (state?.currentVideoId) {
        let pos = state.positionSec;
        try {
          pos = player?.getCurrentTime?.() ?? pos;
        } catch {
          /* not ready yet — fall back to the last synced position */
        }
        publish(state.currentVideoId, "youtube", undefined, false, pos, true);
      }
      return;
    }
    player.pauseVideo();
    publish(player.getVideoData().video_id, "youtube", undefined, false, player.getCurrentTime(), true);
  }, [mediaType, publish, state?.currentVideoId, state?.positionSec, state?.mediaUrl, videoRef]);

  const seek = useCallback(
    (seconds: number) => {
      if (mediaType === "direct") {
        const video = videoRef.current;
        if (!video || !video.dataset.src) {
          // Stage not mounted: still record the seek so the position sticks.
          if (mediaKeyRef.current) {
            setCurrentTime(seconds);
            publish(mediaKeyRef.current, "direct", state?.mediaUrl, state?.isPlaying ?? false, seconds, true);
          }
          return;
        }
        seekWhenReady(video, seconds);
        setCurrentTime(seconds);
        publish(mediaKeyRef.current!, "direct", video.dataset.src, !video.paused, seconds, true);
        return;
      }
      const player = playerRef.current;
      if (!player || !ytReadyRef.current || !state?.currentVideoId) {
        if (state?.currentVideoId) {
          setCurrentTime(seconds);
          publish(state.currentVideoId, "youtube", undefined, state?.isPlaying ?? false, seconds, true);
        }
        return;
      }
      player.seekTo(seconds, true);
      const wasPlaying = player.getPlayerState() === 1;
      if (wasPlaying) player.playVideo();
      setCurrentTime(seconds);
      publish(player.getVideoData().video_id, "youtube", undefined, wasPlaying, seconds, true);
    },
    [mediaType, publish, state?.currentVideoId, state?.positionSec, state?.mediaUrl, state?.isPlaying, videoRef],
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
  }, [mediaType, videoRef]);

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
  }, [mediaType, muted, volume, videoRef]);

  return {
    ytHostRef,
    /** Callback ref for the direct <video> — re-binds listeners on remount. */
    videoElementRef,
    mediaType,
    ready: mediaType === "youtube" ? ytReady : mediaType === "direct",
    playing,
    currentTime,
    duration,
    buffering,
    error: mediaType === "youtube" ? error : null,
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
