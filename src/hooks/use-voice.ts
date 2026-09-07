import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302"] },
  { urls: ["stun:stun1.l.google.com:19302"] },
];

interface Peer {
  sessionId: string;
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  polite: boolean;
  makingOffer: boolean;
  ignoringOffer: boolean;
}

export interface VoiceSessionInfo {
  sessionId: string;
  userName: string;
  avatarHue: number;
  micOn: boolean;
  camOn: boolean;
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
}

export interface VoiceApi {
  inVoice: boolean;
  micOn: boolean;
  camOn: boolean;
  error: string | null;
  participants: VoiceParticipant[];
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  join: () => Promise<void>;
  leave: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
}

/** Perfect-negotiation polite flag: lexicographically smaller session is polite. */
function isPolite(self: string, other: string) {
  return self < other;
}

export function useVoice({ roomId, sessionId, voiceSessions }: UseVoiceOptions): VoiceApi {
  const sendSignal = useMutation(api.rtc.sendSignal);
  const deleteSignal = useMutation(api.rtc.deleteSignal);
  const signals = useQuery(api.rtc.listSignals, { sessionId });

  const [inVoice, setInVoice] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [speakingSet, setSpeakingSet] = useState<Set<string>>(() => new Set());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    () => new Map(),
  );

  const peersRef = useRef<Map<string, Peer>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const micOnRef = useRef(true);
  const camOnRef = useRef(true);
  const inVoiceRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const setTrackEnabled = useCallback((kind: "audio" | "video", enabled: boolean) => {
    // Stream keeps running; we only flip track.enabled (spec: no stop/reopen).
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      if (track.kind === kind) track.enabled = enabled;
    }
  }, []);

  const attachSpeakingMonitor = useCallback((stream: MediaStream) => {
    if (stream.getAudioTracks().length === 0) return;
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

  const createPeer = useCallback(
    (remoteSession: string): Peer => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);

      const peer: Peer = {
        sessionId: remoteSession,
        pc,
        audioEl,
        polite: isPolite(sessionId, remoteSession),
        makingOffer: false,
        ignoringOffer: false,
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
        const [remoteStream] = event.streams;
        if (remoteStream && audioEl.srcObject !== remoteStream) {
          audioEl.srcObject = remoteStream;
        }
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(remoteSession, remoteStream);
          return next;
        });
        // Autoplay guard: retry on the next user gesture if blocked.
        audioEl.play().catch(() => {
          const resume = () => {
            void audioEl.play().catch(() => undefined);
            window.removeEventListener("pointerdown", resume);
          };
          window.addEventListener("pointerdown", resume);
        });
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
        (async () => {
          try {
            peer.makingOffer = true;
            await pc.setLocalDescription();
            await sendSignal({
              roomId,
              fromSession: sessionId,
              toSession: remoteSession,
              kind: "offer",
              payload: JSON.stringify(pc.localDescription?.toJSON()),
            });
          } catch {
            /* negotiation raced; ignore */
          } finally {
            peer.makingOffer = false;
          }
        })();
      };

      return peer;
    },
    [roomId, sendSignal, sessionId],
  );

  const closePeer = useCallback((remoteSession: string) => {
    const peer = peersRef.current.get(remoteSession);
    if (!peer) return;
    try {
      peer.pc.onicecandidate = null;
      peer.pc.ontrack = null;
      peer.pc.onnegotiationneeded = null;
      peer.pc.close();
    } catch {
      /* noop */
    }
    peer.audioEl.srcObject = null;
    peer.audioEl.remove();
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
            const peer = peersRef.current.get(from);
            if (!peer) return;
            try {
              await peer.pc.addIceCandidate(JSON.parse(signal.payload));
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      attachSpeakingMonitor(stream);
      inVoiceRef.current = true;
      setInVoice(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Mikrofon/kamera izni reddedildi. Tarayıcı adres çubuğundan izinleri kontrol et."
          : err instanceof Error
            ? err.message
            : "Mikrofon açılamadı.";
      setError(message);
    }
  }, [attachSpeakingMonitor]);

  const leave = useCallback(() => {
    inVoiceRef.current = false;
    setInVoice(false);
    for (const id of Array.from(peersRef.current.keys())) closePeer(id);
    const stream = localStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams(new Map());
    const ctx = audioCtxRef.current;
    if (ctx) {
      void ctx.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setSpeakingSet(new Set());
  }, [closePeer]);

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

  const toggleCam = useCallback(() => {
    const next = !camOnRef.current;
    camOnRef.current = next;
    setCamOn(next);
    setTrackEnabled("video", next);
  }, [setTrackEnabled]);

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
    error,
    participants,
    localStream,
    remoteStreams,
    join,
    leave,
    toggleMic,
    toggleCam,
  };
}
