import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  autoGainEnabled,
  echoCancellationEnabled,
  krispEnabled,
  micAudioConstraints,
  preferredMicId,
  pttKey,
  voiceMode,
  type VoiceMode,
} from "@/lib/prefs";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Krisp-style mic chain honoring the per-toggle settings (Ses & Görüntü). */
function micConstraints(): MediaTrackConstraints {
  return {
    ...micAudioConstraints(),
    // Redundant but explicit: krisp master + individual toggles + device pick.
    echoCancellation: krispEnabled() && echoCancellationEnabled(),
    autoGainControl: krispEnabled() && autoGainEnabled(),
  };
}

interface Peer {
  sessionId: string;
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement | null;
  polite: boolean;
  makingOffer: boolean;
  ignoringOffer: boolean;
  /** ICE candidates that arrived before setRemoteDescription completed. */
  candidateQueue: RTCIceCandidateInit[];
  /** True once setRemoteDescription succeeded — queued candidates flushed. */
  remoteDescriptionSet: boolean;
  /** True while this peer has a live outbound video sender (camera or screen). */
  videoSentRef: boolean;
}

/**
 * 🔑 Screen-share core: attach an outbound video track to one peer WITHOUT a
 * full offer/answer cycle where possible. Peers that already send video get
 * `sender.replaceTrack` (pure track swap, zero renegotiation); peers without a
 * video m-line get `addTransceiver(track, sendonly)`, which seeds the sender
 * slot so FUTURE track swaps are renegotiation-free too. Transceivers still
 * fire onnegotiationneeded once — perfect negotiation absorbs it.
 */
async function attachVideoTrackToPeer(
  peer: Peer,
  track: MediaStreamTrack,
  stream: MediaStream,
): Promise<void> {
  const pc = peer.pc;
  const existing = pc.getSenders().find((s) => s.track?.kind === "video");
  if (existing) {
    await existing.replaceTrack(track);
    peer.videoSentRef = true;
    return;
  }
  const transceiver = pc.addTransceiver(track, { direction: "sendonly", streams: [stream] });
  if (!transceiver?.sender) throw new Error("addTransceiver başarısız");
  peer.videoSentRef = true;
}

export interface VoiceSessionInfo {
  sessionId: string;
  /** Convex user id — context-menu profile cards / owner kicks key off it. */
  userId: string;
  userName: string;
  avatarHue: number;
  micOn: boolean;
  camOn: boolean;
  isSharing?: boolean;
}

export interface VoiceParticipant extends VoiceSessionInfo {
  speaking: boolean;
  isSelf: boolean;
}

export interface UseVoiceOptions {
  roomId: Id<"rooms">;
  sessionId: string;
  /** Presence rows currently in voice — drives mesh topology. */
  voiceSessions: VoiceSessionInfo[];
  /** Optional callback so parents can mirror voice state (e.g. presence heartbeats). */
  onVoiceStateChange?: (state: { inVoice: boolean; micOn: boolean; camOn: boolean; isSharing: boolean }) => void;
}

export interface VoiceApi {
  inVoice: boolean;
  micOn: boolean;
  camOn: boolean;
  isSharing: boolean;
  error: string | null;
  /** 🖥️ Screen-share specific error (permission denied, device busy...). */
  screenShareError: string | null;
  /** 🖥️ The live display capture stream (self-preview attaches to this). */
  screenStream: MediaStream | null;
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  startScreenShare: () => void;
  stopScreenShare: () => void;
  /** Krisp-style noise suppression toggle (persists, re-opens the mic). */
  krisp: boolean;
  toggleKrisp: () => Promise<void>;
  /** Local per-user gain 0–2 (1 = %100, 2 = %200). */
  getPeerVolume: (sessionId: string) => number;
  setPeerVolume: (sessionId: string, volume: number) => void;
  /** Push-to-talk: true while the PTT key is held (micOn follows this in ptt mode). */
  pttActive: boolean;
}

/** Perfect-negotiation polite flag: lexicographically smaller session is polite. */
function isPolite(self: string, other: string) {
  return self < other;
}

/**
 * Isolated container for remote WebRTC <audio> elements. Keeping them out of
 * React's render root means React never has to reconcile around them, and
 * removal on leave/disconnect can never detach a node React still tracks.
 */
function remoteAudioRoot(): HTMLElement {
  let root = document.getElementById("ordex-remote-audio");
  if (!root) {
    root = document.createElement("div");
    root.id = "ordex-remote-audio";
    root.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;";
    document.body.appendChild(root);
  }
  return root;
}

export function useVoice({
  roomId,
  sessionId,
  voiceSessions,
  onVoiceStateChange,
}: UseVoiceOptions): VoiceApi {
  const sendSignal = useMutation(api.rtc.sendSignal);
  const deleteSignal = useMutation(api.rtc.deleteSignal);
  const signals = useQuery(api.rtc.listSignals, { sessionId });

  const [inVoice, setInVoice] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false); // camera is lazy: only on explicit user action
  const [error, setError] = useState<string | null>(null);
  const [speakingSet, setSpeakingSet] = useState<Set<string>>(() => new Set());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    () => new Map(),
  );

  const peersRef = useRef<Map<string, Peer>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const micOnRef = useRef(true);
  const camOnRef = useRef(false);
  const inVoiceRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cameraAcquiringRef = useRef(false);
  // Per-peer local volume (0–2) applied via the <audio> element. Web Audio
  // gain nodes per remote stream would fight the autoplay guard; element
  // volume is instant, survives stream swaps and costs nothing.
  const peerVolumeRef = useRef<Map<string, number>>(new Map());
  const [, bumpPeerVolumes] = useState(0); // re-render so UI sliders stay in sync
  // Reactive mirror of the Krisp pref so toggle buttons update instantly.
  const [krispState, setKrispState] = useState(() => krispEnabled());
  // 🗣️ Push-to-talk: PTT mode gates the mic on a held key.
  const pttModeRef = useRef<VoiceMode>(voiceMode());
  const pttKeyRef = useRef(pttKey());
  const pttHeldRef = useRef(false);
  const [pttActive, setPttActive] = useState(false);
  // Screen / game broadcast state (gaming rooms).
  const [isSharing, setIsSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const sharingRef = useRef(false);
  const [screenShareError, setScreenShareError] = useState<string | null>(null);

  // Mirror voice state up to the parent without re-triggering effects.
  // (Ref writes happen in effects — never during render.)
  const onVoiceStateChangeRef = useRef(onVoiceStateChange);
  useEffect(() => {
    onVoiceStateChangeRef.current = onVoiceStateChange;
  }, [onVoiceStateChange]);
  useEffect(() => {
    onVoiceStateChangeRef.current?.({ inVoice, micOn, camOn, isSharing });
  }, [inVoice, micOn, camOn, isSharing]);

  const setTrackEnabled = useCallback((kind: "audio" | "video", enabled: boolean) => {
    // Stream keeps running; we only flip track.enabled (no stop/reopen).
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (track.kind === kind) track.enabled = enabled;
    }
    // 🖥️ While broadcasting, the screen track lives in its own stream — sync
    // its enabled flag too so stop/start states stay consistent everywhere.
    const share = shareStreamRef.current;
    if (share && kind === "video") {
      for (const track of share.getVideoTracks()) track.enabled = enabled;
    }
  }, []);

  // 🗣️ Push-to-talk: hold the configured key to open the mic. track.enabled
  // flips WITHOUT touching micOnRef so the user's toggle choice is preserved —
  // PTT "amplifies" the existing state instead of fighting it.
  useEffect(() => {
    pttModeRef.current = voiceMode();
    pttKeyRef.current = pttKey();
  }, []);
  useEffect(() => {
    if (pttModeRef.current !== "ptt") return;
    const isPttKey = (e: KeyboardEvent) =>
      !e.repeat && (e.code === pttKeyRef.current || (pttKeyRef.current === "" && e.code === "Space"));
    const down = (e: KeyboardEvent) => {
      if (!inVoiceRef.current || !isPttKey(e)) return;
      // Never hijack typing in inputs.
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      pttHeldRef.current = true;
      setPttActive(true);
      setTrackEnabled("audio", true);
    };
    const up = (e: KeyboardEvent) => {
      if (!isPttKey(e)) return;
      pttHeldRef.current = false;
      setPttActive(false);
      // Release re-applies the user's explicit mute choice.
      setTrackEnabled("audio", micOnRef.current);
    };
    const blur = () => {
      if (!pttHeldRef.current) return;
      pttHeldRef.current = false;
      setPttActive(false);
      setTrackEnabled("audio", micOnRef.current);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [setTrackEnabled]);

  const attachSpeakingMonitor = useCallback((stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return;
    if (audioCtxRef.current) return;
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const interval = setInterval(() => {
        if (audioCtxRef.current === null) {
          clearInterval(interval);
          return;
        }
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const speaking = Math.sqrt(sum / buf.length) > 14 && micOnRef.current;
        setSpeakingSet((prev) => {
          if (prev.has(sessionId) === speaking) return prev;
          const next = new Set(prev);
          if (speaking) next.add(sessionId);
          else next.delete(sessionId);
          return next;
        });
      }, 250);
    } catch {
      /* speaking indicator is best-effort */
    }
  }, [sessionId]);

  /** Try to play; if autoplay is blocked, retry on the next user gesture. */
  const playWithAutoplayGuard = useCallback((audioEl: HTMLAudioElement) => {
    audioEl.play().catch((err: unknown) => {
      console.log("Autoplay bekleniyor:", err);
      const resume = () => {
        void audioEl.play().catch(() => undefined);
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
      window.addEventListener("pointerdown", resume);
      window.addEventListener("keydown", resume);
    });
  }, []);

  /** (Re)negotiate a peer: setLocalDescription then send the offer. */
  const negotiate = useCallback(
    async (peer: Peer) => {
      try {
        peer.makingOffer = true;
        // 🖥️ Fix: when a new transceiver (e.g. an added screen share track)
        // fires onnegotiationneeded while we're still in "have-local-offer",
        // Chromium cannot build a fresh offer — the negotiation silently dies
        // and the remote side never renders the stream. An explicit rollback
        // resets signaling so a clean offer is always produced.
        if (peer.pc.signalingState === "have-local-offer") {
          await peer.pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
        }
        await peer.pc.setLocalDescription();
        await sendSignal({
          roomId,
          fromSession: sessionId,
          toSession: peer.sessionId,
          kind: "offer",
          payload: JSON.stringify(peer.pc.localDescription?.toJSON()),
        });
      } catch {
        /* negotiation raced; ignore */
      } finally {
        peer.makingOffer = false;
      }
    },
    [roomId, sendSignal, sessionId],
  );

  const createPeer = useCallback(
    (remoteSession: string): Peer => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      const peer: Peer = {
        sessionId: remoteSession,
        pc,
        audioEl: null, // created in ontrack when the remote stream actually arrives
        polite: isPolite(sessionId, remoteSession),
        makingOffer: false,
        ignoringOffer: false,
        candidateQueue: [],
        remoteDescriptionSet: false,
        videoSentRef: false,
      };

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
          if (track.kind === "video") peer.videoSentRef = true;
        }
      }
      // 🖥️ Already broadcasting when a peer is (re)created (e.g. mesh repair
      // after ICE failure)? Attach the screen track immediately so the new
      // peer receives the live broadcast without waiting for anything else.
      const share = shareStreamRef.current;
      if (sharingRef.current && share) {
        const screenTrack = share.getVideoTracks()[0];
        if (screenTrack) {
          void attachVideoTrackToPeer(peer, screenTrack, share).catch((err) =>
            console.warn("screen attach on create failed", err),
          );
        }
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          void sendSignal({
            roomId,
            fromSession: sessionId,
            toSession: remoteSession,
            kind: "ice",
            payload: JSON.stringify(event.candidate.toJSON()),
          }).catch(() => undefined);
        }
      };

      pc.ontrack = (event) => {
        // Build a dedicated <audio autoplay> element for the remote stream.
        // Elements live in an isolated container appended to <body> — never as
        // loose siblings of React-managed/portal nodes, which is a known
        // trigger for "insertBefore ... not a child of this node" crashes.
        let audioEl = peer.audioEl;
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.dataset.peer = remoteSession;
          remoteAudioRoot().appendChild(audioEl);
          peer.audioEl = audioEl;
        }
        const [remoteStream] = event.streams;
        if (remoteStream) {
          if (audioEl.srcObject !== remoteStream) {
            audioEl.srcObject = remoteStream;
            setRemoteStreams((prev) => {
              const next = new Map(prev);
              next.set(remoteSession, remoteStream);
              return next;
            });
          }
          // Apply the user's local per-peer volume (default %100).
          const vol = peerVolumeRef.current.get(remoteSession) ?? 1;
          audioEl.volume = Math.min(1, Math.max(0, vol));
          audioEl.muted = vol <= 0;
          playWithAutoplayGuard(audioEl);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          try {
            pc.restartIce();
          } catch {
            /* noop */
          }
        }
      };

      // ICE-level watchdog: temporary drops report "disconnected" and hard
      // failures report "failed". Both trigger restartIce() WITHOUT tearing
      // the session down, so voice self-heals after tab switches / network
      // changes instead of leaving the user stuck in a silent channel.
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState !== "disconnected" && pc.iceConnectionState !== "failed") return;
        try {
          pc.restartIce();
        } catch {
          /* older browsers without restartIce */
        }
        // If ICE is still not back after the restart grace period, the
        // negotiation mesh effect will rebuild the peer from scratch.
        if (pc.iceConnectionState === "failed") {
          window.setTimeout(() => {
            if (pc.iceConnectionState === "failed" && peersRef.current.get(remoteSession) === peer) {
              try {
                pc.restartIce();
              } catch {
                /* noop */
              }
              void negotiate(peer);
            }
          }, 3000);
        }
      };

      // Perfect negotiation.
      pc.onnegotiationneeded = () => {
        void negotiate(peer);
      };

      return peer;
    },
    [roomId, sendSignal, sessionId, playWithAutoplayGuard, negotiate],
  );

  /** Flush ICE candidates queued while setRemoteDescription was pending. */
  const drainCandidateQueue = useCallback(async (peer: Peer) => {
    const queued = peer.candidateQueue.splice(0, peer.candidateQueue.length);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (err) {
        if (!peer.ignoringOffer) console.warn("addIceCandidate failed", err);
      }
    }
  }, []);

  const closePeer = useCallback((remoteSession: string) => {
    const peer = peersRef.current.get(remoteSession);
    if (!peer) return;
    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.onnegotiationneeded = null;
      peer.pc.onconnectionstatechange = null;
      peer.pc.close();
    } catch {
      /* noop */
    }
    // Remove the remote <audio> element so its sound fully stops.
    if (peer.audioEl) {
      peer.audioEl.srcObject = null;
      peer.audioEl.remove();
    }
    peer.candidateQueue.length = 0;
    peersRef.current.delete(remoteSession);
    setRemoteStreams((prev) => {
      if (!prev.has(remoteSession)) return prev;
      const next = new Map(prev);
      next.delete(remoteSession);
      return next;
    });
  }, []);

  // ---- Mesh topology: create/destroy peers as voice participants change ----
  useEffect(() => {
    if (!inVoice) return;
    const others = voiceSessions
      .map((v) => v.sessionId)
      .filter((id) => id !== sessionId);
    for (const id of others) {
      if (!peersRef.current.has(id)) {
        try {
          peersRef.current.set(id, createPeer(id));
        } catch (err) {
          console.error("peer create failed", err);
        }
      }
    }
    for (const id of Array.from(peersRef.current.keys())) {
      if (!others.includes(id)) closePeer(id);
    }
  }, [inVoice, voiceSessions, sessionId, createPeer, closePeer]);

  // ---- Consume incoming signals ----
  useEffect(() => {
    if (!inVoice || !signals || signals.length === 0) return;
    for (const signal of signals) {
      void (async () => {
        const from = signal.fromSession;
        try {
          if (signal.kind === "offer" || signal.kind === "answer") {
            const desc = JSON.parse(signal.payload) as RTCSessionDescriptionInit;
            let peer = peersRef.current.get(from);
            if (!peer) {
              peer = createPeer(from);
              peersRef.current.set(from, peer);
            }
            const offerCollision =
              desc.type === "offer" &&
              (peer.makingOffer || peer.pc.signalingState !== "stable");
            peer.ignoringOffer = !peer.polite && offerCollision;
            if (peer.ignoringOffer) return;
            await peer.pc.setRemoteDescription(desc);
            // Remote description is set: safe to accept candidates now, and
            // flush everything that arrived earlier without crashing.
            peer.remoteDescriptionSet = true;
            await drainCandidateQueue(peer);
            if (desc.type === "offer") {
              await peer.pc.setLocalDescription();
              await sendSignal({
                roomId,
                fromSession: sessionId,
                toSession: from,
                kind: "answer",
                payload: JSON.stringify(peer.pc.localDescription?.toJSON()),
              });
            }
          } else if (signal.kind === "ice") {
            const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
            let peer = peersRef.current.get(from);
            if (!peer) {
              // Peer may not exist yet (signal race) — buffer in a detached
              // queue entry so nothing is lost and nothing crashes.
              peer = createPeer(from);
              peersRef.current.set(from, peer);
            }
            if (!peer.remoteDescriptionSet) {
              peer.candidateQueue.push(candidate);
              return;
            }
            try {
              await peer.pc.addIceCandidate(candidate);
            } catch (err) {
              if (!peer.ignoringOffer) throw err;
            }
          }
        } catch (err) {
          console.warn("signal handling failed", signal.kind, err);
        } finally {
          void deleteSignal({ signalId: signal._id }).catch(() => undefined);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals, inVoice]);

  const join = useCallback(async () => {
    if (inVoiceRef.current) return;
    setError(null);
    try {
      // Voice-first join: mic with the persisted Krisp-style constraint set.
      // Video is requested lazily via the camera toggle, so permission dialog
      // and channel latency stay minimal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints(),
        video: false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      attachSpeakingMonitor(stream);
      inVoiceRef.current = true;
      setInVoice(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Mikrofon izni reddedildi. Tarayıcı adres çubuğundan izinleri kontrol et."
          : err instanceof Error
            ? err.message
            : "Mikrofon açılamadı.";
      setError(message);
    }
  }, [attachSpeakingMonitor]);

  /** Stop the display/game capture and restore peers to camera-off state. */
  const stopScreenShare = useCallback(() => {
    if (!sharingRef.current) return;
    sharingRef.current = false;
    setIsSharing(false);
    const stream = shareStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    shareStreamRef.current = null;
    setScreenStream(null);
    setScreenShareError(null);
    // 🖥️ Fix: restore peers to camera-off state via replaceTrack(null) on the
    // SAME sender the screen track occupied — no peer teardown, no offer
    // churn. The m-line stays, so the NEXT share starts renegotiation-free.
    for (const peer of peersRef.current.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        void sender.replaceTrack(null).catch(() => undefined);
      }
      peer.videoSentRef = false;
    }
  }, []);

  /**
   * 🖥️ Broadcast the display/game capture to every peer.
   * getDisplayMedia({ video, audio }) → replaceTrack on peers that already
   * send video; addTransceiver(sendonly) on peers without a video m-line.
   * `track.onended` (browser's native "Stop sharing" bar) restores cleanly.
   */
  const startScreenShare = useCallback(async () => {
    if (sharingRef.current) return;
    setScreenShareError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true,
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Ekran paylaşımı reddedildi."
          : err instanceof Error
            ? err.message
            : "Ekran paylaşımı başlatılamadı.";
      setError(message);
      setScreenShareError(message);
      return;
    }
    const screenTrack = stream.getVideoTracks()[0];
    if (!screenTrack) return;
    shareStreamRef.current = stream;
    setScreenStream(stream);
    sharingRef.current = true;
    setIsSharing(true);
    // Browser's built-in "stop sharing" button ends the broadcast cleanly —
    // peers fall back to camera-off state automatically.
    screenTrack.addEventListener("ended", () => stopScreenShare());

    // Ensure the voice mesh exists before attaching video tracks. If we were
    // NOT in voice, open the mic first so every peer is created with audio —
    // viewers and sharer can then talk (best-effort; sharing works without it).
    if (!localStreamRef.current) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() });
        localStreamRef.current = mic;
        setLocalStream(mic);
        attachSpeakingMonitor(mic);
        inVoiceRef.current = true;
        setInVoice(true);
      } catch {
        /* voice is optional while sharing */
      }
    }

    for (const peer of peersRef.current.values()) {
      try {
        await attachVideoTrackToPeer(peer, screenTrack, stream);
      } catch (err) {
        console.warn("screen track attach failed", err);
      }
    }
  }, [attachSpeakingMonitor, stopScreenShare]);

  const leave = useCallback(() => {
    inVoiceRef.current = false;
    setInVoice(false);
    // Close every peer connection and drop remote audio elements.
    for (const id of Array.from(peersRef.current.keys())) closePeer(id);
    // Stop all local tracks (mic + camera + screen share if any).
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    stopScreenShare();
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams(new Map());
    cameraAcquiringRef.current = false;
    const ctx = audioCtxRef.current;
    if (ctx) {
      void ctx.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setSpeakingSet(new Set());
    camOnRef.current = false;
    setCamOn(false);
  }, [closePeer, stopScreenShare]);

  const toggleMic = useCallback(() => {
    // Stream stays alive; only track.enabled flips (spec requirement).
    const next = !micOnRef.current;
    micOnRef.current = next;
    setMicOn(next);
    setTrackEnabled("audio", next);
    if (!next) {
      setSpeakingSet((prev) => {
        const next2 = new Set(prev);
        next2.delete(sessionId);
        return next2;
      });
    }
  }, [sessionId, setTrackEnabled]);

  const toggleCam = useCallback(async () => {
    // 🖥️ Screen share owns the outbound video m-line — never rip it out from
    // under a live broadcast (that kills the stream on every viewer).
    if (sharingRef.current) {
      setScreenShareError("Ekran paylaşımı sırasında kamera değiştirilemez. Önce yayını durdur.");
      return;
    }
    if (camOnRef.current) {
      // Turn camera off: flip the flag and stop the video track cleanly.
      camOnRef.current = false;
      setCamOn(false);
      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getVideoTracks()) {
          track.stop();
          stream.removeTrack(track);
        }
      }
      // Renegotiate so peers drop the video track.
      for (const peer of peersRef.current.values()) {
        void negotiate(peer);
      }
      return;
    }
    if (cameraAcquiringRef.current) return;
    cameraAcquiringRef.current = true;
    try {
      let stream = localStreamRef.current;
      if (!stream) {
        // Not in voice: behave like a voice join with camera.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints(),
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        attachSpeakingMonitor(stream);
        inVoiceRef.current = true;
        setInVoice(true);
      } else {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
        });
        const track = cam.getVideoTracks()[0];
        if (!track) throw new Error("Kamera açılamadı.");
        cam.getAudioTracks().forEach((t) => t.stop()); // avoid double mic capture
        stream.addTrack(track);
        // Replace the video sender per peer so no renegotiation is needed.
        let replaced = false;
        for (const peer of peersRef.current.values()) {
          try {
            await attachVideoTrackToPeer(peer, track, stream);
            replaced = true;
          } catch (err) {
            console.warn("camera attach failed", err);
          }
        }
        if (!replaced) setError("Kamera başlatılamadı.");
      }
      camOnRef.current = true;
      setCamOn(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Kamera izni reddedildi."
          : err instanceof Error
            ? err.message
            : "Kamera açılamadı.";
      setError(message);
    } finally {
      cameraAcquiringRef.current = false;
    }
  }, [attachSpeakingMonitor]);

  /** Toggle Krisp-style processing: reopen the mic with new constraints. */
  const toggleKrisp = useCallback(async () => {
    const next = !krispEnabled();
    try {
      localStorage.setItem("ordex:krisp", next ? "1" : "0");
    } catch {
      /* private mode */
    }
    setKrispState(next);
    // Re-acquire the mic with the new constraint set. If we're not in voice
    // yet, the next join() picks it up — never open the mic preemptively
    // (that would trigger a surprise permission prompt).
    if (!inVoiceRef.current || !localStreamRef.current) return;
    const wasMuted = !micOnRef.current;
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
      const old = localStreamRef.current;
      if (old) {
        for (const t of old.getTracks()) t.stop();
      }
      if (wasMuted) {
        for (const t of fresh.getAudioTracks()) t.enabled = false;
      }
      localStreamRef.current = fresh;
      setLocalStream(fresh);
      // Re-arm the speaking monitor on the new stream (the old AudioContext
      // still reads the dead stream otherwise).
      const oldCtx = audioCtxRef.current;
      if (oldCtx) {
        void oldCtx.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
      attachSpeakingMonitor(fresh);
      // Swap the outgoing audio track on every live peer — no renegotiation.
      for (const peer of peersRef.current.values()) {
        const sender = peer.pc.getSenders().find((s) => s.track?.kind === "audio");
        if (sender) {
          await sender.replaceTrack(fresh.getAudioTracks()[0]).catch(() => undefined);
        } else {
          for (const t of fresh.getTracks()) peer.pc.addTrack(t, fresh);
        }
      }
    } catch {
      // Permission hiccup: keep the old stream, surface nothing fatal.
    }
  }, [attachSpeakingMonitor]);

  const getPeerVolume = useCallback(
    (sid: string) => peerVolumeRef.current.get(sid) ?? 1,
    [],
  );

  const setPeerVolume = useCallback((sid: string, volume: number) => {
    const clamped = Math.min(2, Math.max(0, volume));
    peerVolumeRef.current.set(sid, clamped);
    const peer = peersRef.current.get(sid);
    if (peer?.audioEl) {
      // Element volume caps at 1; >1 keeps full element volume (browser limit)
      // and the UI slider still reflects the 0–200 range.
      peer.audioEl.volume = Math.min(1, clamped);
      peer.audioEl.muted = clamped <= 0;
    }
    bumpPeerVolumes((v) => v + 1);
  }, []);

  useEffect(() => () => leave(), [leave]);

  const participants: VoiceParticipant[] = voiceSessions.map((v) => ({
    ...v,
    speaking: speakingSet.has(v.sessionId),
    isSelf: v.sessionId === sessionId,
  }));

  return {
    inVoice,
    micOn,
    camOn,
    isSharing,
    error,
    screenShareError,
    screenStream,
    participants,
    localStream,
    remoteStreams,
    join,
    leave,
    toggleMic,
    toggleCam: () => void toggleCam(),
    startScreenShare: () => void startScreenShare(),
    stopScreenShare,
    krisp: krispState,
    toggleKrisp,
    getPeerVolume,
    setPeerVolume,
    pttActive,
  };
}
