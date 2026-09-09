import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

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
}

export interface VoiceSessionInfo {
  sessionId: string;
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
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  startScreenShare: () => void;
  stopScreenShare: () => void;
}

/** Perfect-negotiation polite flag: lexicographically smaller session is polite. */
function isPolite(self: string, other: string) {
  return self < other;
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
  // Screen / game broadcast state (gaming rooms).
  const [isSharing, setIsSharing] = useState(false);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const sharingRef = useRef(false);

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
  }, []);

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
      };

      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) {
          pc.addTrack(track, stream);
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
        let audioEl = peer.audioEl;
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.dataset.peer = remoteSession;
          document.body.appendChild(audioEl);
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
      // Voice-first join: mic with echo cancellation / noise suppression / AGC.
      // Video is requested lazily via the camera toggle, so permission dialog
      // and channel latency stay minimal.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
    // Restore peers to camera-off state: stop video senders.
    for (const peer of peersRef.current.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        void sender.replaceTrack(null).catch(() => undefined);
      }
    }
  }, []);

  /** Broadcast the display/game capture to every peer (replaces camera track). */
  const startScreenShare = useCallback(async () => {
    if (sharingRef.current) return;
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
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    // Browser's built-in "stop sharing" button ends the broadcast cleanly.
    track.addEventListener("ended", () => stopScreenShare());
    shareStreamRef.current = stream;
    sharingRef.current = true;
    setIsSharing(true);
    let replaced = false;
    for (const peer of peersRef.current.values()) {
      const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(track);
        replaced = true;
      }
    }
    if (!replaced) {
      for (const peer of peersRef.current.values()) {
        peer.pc.addTrack(track, stream);
      }
    }
    // If we were in a call without voice yet, also open the mic so viewers
    // and sharer can talk (best-effort; sharing still works without it).
    if (!localStreamRef.current) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        localStreamRef.current = mic;
        setLocalStream(mic);
        attachSpeakingMonitor(mic);
        inVoiceRef.current = true;
        setInVoice(true);
        for (const peer of peersRef.current.values()) {
          for (const t of mic.getAudioTracks()) peer.pc.addTrack(t, mic);
        }
      } catch {
        /* voice is optional while sharing */
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
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
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
          const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(track);
            replaced = true;
          }
        }
        if (!replaced) {
          for (const peer of peersRef.current.values()) {
            peer.pc.addTrack(track, stream);
          }
        }
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
  }, [attachSpeakingMonitor, negotiate]);

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
    participants,
    localStream,
    remoteStreams,
    join,
    leave,
    toggleMic,
    toggleCam: () => void toggleCam(),
    startScreenShare: () => void startScreenShare(),
    stopScreenShare,
  };
}
