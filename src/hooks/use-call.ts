import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playSound, useCallSound } from "@/lib/sounds";
import { getSessionId } from "@/lib/utils-room";

// ---------- ÖRDEX 1:1 voice calls (WebRTC over the callSignals relay) ----------
// Same battle-tested pattern as useVoice (perfect negotiation, candidate
// queue, ICE restart watchdog) but peer-to-peer between exactly two users.

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type CallState = "idle" | "outgoing-ringing" | "active";

/** Phase of the live call, for the Discord-style top banner + profile bar. */
export type CallPhase = "incoming" | "outgoing" | "active" | null;

export interface IncomingCall {
  callId: Id<"calls">;
  peerName: string;
  peerAvatar?: string;
  peerStatus?: string;
}

interface CallApi {
  state: CallState;
  /** The live call's peer (null when idle). */
  peer: { name: string; avatarUrl?: string; statusMessage?: string } | null;
  /** Someone is ringing us right now (drives the Accept/Reject popup). */
  incoming: IncomingCall | null;
  start: (peerUserId: Id<"users">, peerName: string, peerAvatar?: string) => Promise<void>;
  accept: () => Promise<void>;
  reject: () => void;
  hangUp: () => void;
  micOn: boolean;
  toggleMic: () => void;
  /** Remote audio muted (kulaklık kapalı) — mutes playback only, not the call. */
  deafened: boolean;
  toggleDeafen: () => void;
}

/** Isolated <body>-level container for remote call audio (never in React's tree). */
function callAudioRoot(): HTMLElement {
  let root = document.getElementById("ordex-call-audio");
  if (!root) {
    root = document.createElement("div");
    root.id = "ordex-call-audio";
    root.style.cssText = "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;";
    document.body.appendChild(root);
  }
  return root;
}

export function useCall(): CallApi {
  // Stable per-tab id (same value Room uses for presence).
  const sessionId = useMemo(() => getSessionId(), []);
  const [state, setState] = useState<CallState>("idle");
  const [peer, setPeer] = useState<CallApi["peer"]>(null);
  const [micOn, setMicOn] = useState(true);
  const [deafened, setDeafened] = useState(false);

  const startCall = useMutation(api.dms.startCall);
  const acceptCallM = useMutation(api.dms.acceptCall);
  const endCallM = useMutation(api.dms.endCall);
  const sendSignalM = useMutation(api.dms.sendCallSignal);
  const deleteSignalM = useMutation(api.dms.deleteCallSignal);

  // Reactive subscriptions: incoming ring + my outgoing/active call mirror.
  // Gated on auth: before the token is attached these queries would either
  // error server-side or race the session — skip until signed in.
  const { isAuthenticated } = useConvexAuth();
  const callQueryArgs = isAuthenticated ? {} : "skip";
  const incomingQuery = useQuery(api.dms.myIncomingCall, callQueryArgs);
  const outgoingQuery = useQuery(api.dms.myActiveCall, callQueryArgs);
  const calleeQuery = useQuery(api.dms.myActiveCalleeCall, callQueryArgs);
  const signals = useQuery(
    api.dms.listCallSignals,
    isAuthenticated ? { sessionId } : "skip",
  );

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteSetRef = useRef(false);
  const makingOfferRef = useRef(false);
  const politeRef = useRef(true);
  const ignoringOfferRef = useRef(false);
  const activeCallIdRef = useRef<Id<"calls"> | null>(null);
  // Mirror for event handlers created before `deafened` existed.
  const deafenedRef = useRef(false);

  const sendSignal = useCallback(
    (
      callId: Id<"calls">,
      toSession: string,
      kind: "offer" | "answer" | "ice",
      payload: string,
    ) => {
      void sendSignalM({ callId, fromSession: sessionId, toSession, kind, payload }).catch(
        () => undefined,
      );
    },
    [sendSignalM, sessionId],
  );

  const deleteSignal = useCallback(
    (id: Id<"callSignals">) => {
      void deleteSignalM({ signalId: id }).catch(() => undefined);
    },
    [deleteSignalM],
  );

  const teardownPeer = useCallback(() => {
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onnegotiationneeded = null;
        pc.oniceconnectionstatechange = null;
        pc.close();
      } catch {
        /* noop */
      }
    }
    pcRef.current = null;
    for (const t of localStreamRef.current?.getTracks() ?? []) t.stop();
    localStreamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    candidateQueueRef.current = [];
    remoteSetRef.current = false;
    makingOfferRef.current = false;
    ignoringOfferRef.current = false;
  }, []);

  const finish = useCallback(
    (playHangupTone: boolean) => {
      teardownPeer();
      activeCallIdRef.current = null;
      setState("idle");
      setPeer(null);
      setMicOn(true);
      setDeafened(false);
      if (playHangupTone) playSound("hangup");
    },
    [teardownPeer],
  );

  const createPeer = useCallback(
    (callId: Id<"calls">, remoteSession: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      politeRef.current = sessionId < remoteSession;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(callId, remoteSession, "ice", JSON.stringify(event.candidate.toJSON()));
        }
      };

      pc.ontrack = (event) => {
        let audioEl = audioElRef.current;
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.autoplay = true;
          audioEl.dataset.call = callId;
          callAudioRoot().appendChild(audioEl);
          audioElRef.current = audioEl;
        }
        const [remoteStream] = event.streams;
        if (remoteStream && audioEl.srcObject !== remoteStream) {
          audioEl.srcObject = remoteStream;
        }
        audioEl.muted = deafenedRef.current;
        // Autoplay guard: retry on the next user gesture if blocked.
        audioEl.play().catch(() => {
          const resume = () => {
            void audioEl?.play().catch(() => undefined);
            window.removeEventListener("pointerdown", resume);
            window.removeEventListener("keydown", resume);
          };
          window.addEventListener("pointerdown", resume);
          window.addEventListener("keydown", resume);
        });
      };

      pc.onnegotiationneeded = () => {
        void (async () => {
          try {
            makingOfferRef.current = true;
            await pc.setLocalDescription();
            if (pc.localDescription) {
              sendSignal(callId, remoteSession, "offer", JSON.stringify(pc.localDescription.toJSON()));
            }
          } catch {
            /* raced */
          } finally {
            makingOfferRef.current = false;
          }
        })();
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
          try {
            pc.restartIce();
          } catch {
            /* older browsers */
          }
        }
      };

      // Hard failure watchdog: if the connection is still "failed" after the
      // restart grace period, actually end the call instead of leaving a dead
      // "Görüşme sürüyor" bar hanging on screen forever.
      pc.onconnectionstatechange = () => {
        if (pc.connectionState !== "failed") return;
        window.setTimeout(() => {
          if (pcRef.current === pc && pc.connectionState === "failed") {
            const id = activeCallIdRef.current;
            if (id) void endCallM({ callId: id, outcome: "ended" }).catch(() => undefined);
            finish(true);
          }
        }, 5000);
      };
      return pc;
    },
    [sessionId, sendSignal, endCallM, finish],
  );

  const ensureMic = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  // ---- Public actions ----

  const start = useCallback(
    async (peerUserId: Id<"users">, peerName: string, peerAvatar?: string) => {
      if (activeCallIdRef.current || state !== "idle") return;
      setPeer({ name: peerName, avatarUrl: peerAvatar });
      setState("outgoing-ringing");
      try {
        const { callId } = await startCall({ calleeId: peerUserId, callerSession: sessionId });
        activeCallIdRef.current = callId;
      } catch {
        finish(true);
      }
    },
    [sessionId, startCall, finish, state],
  );

  const accept = useCallback(async () => {
    const incoming = incomingQuery;
    if (!incoming || activeCallIdRef.current) return;
    try {
      const stream = await ensureMic();
      await acceptCallM({ callId: incoming.callId, calleeSession: sessionId });
      activeCallIdRef.current = incoming.callId;
      setPeer({ name: incoming.peerName, avatarUrl: incoming.peerAvatar });
      setState("active");
      const pc = createPeer(incoming.callId, incoming.callerSession);
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
    } catch (err) {
      void endCallM({ callId: incoming.callId, outcome: "ended" });
      finish(true);
      console.warn("call accept failed", err);
    }
  }, [incomingQuery, ensureMic, acceptCallM, sessionId, createPeer, endCallM, finish]);

  const reject = useCallback(() => {
    const incoming = incomingQuery;
    if (incoming) {
      void endCallM({ callId: incoming.callId, outcome: "rejected" }).catch(() => undefined);
    }
    finish(false);
  }, [incomingQuery, endCallM, finish]);

  const hangUp = useCallback(() => {
    const callId = activeCallIdRef.current;
    if (callId) void endCallM({ callId, outcome: "ended" }).catch(() => undefined);
    finish(false);
  }, [endCallM, finish]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !stream.getAudioTracks().every((t) => t.enabled);
    for (const t of stream.getAudioTracks()) t.enabled = next;
    setMicOn(next);
  }, []);

  // Kulaklık: mute only the remote <audio> element — the WebRTC stream keeps
  // flowing, so un-deafening restores the peer's voice instantly.
  const toggleDeafen = useCallback(() => {
    setDeafened((d) => {
      const next = !d;
      deafenedRef.current = next;
      if (audioElRef.current) audioElRef.current.muted = next;
      return next;
    });
  }, []);

  // ---- Ring/dial loops (derived, no effect churn) ----
  const ringingOut = state === "outgoing-ringing";
  const ringingIn = state === "idle" && incomingQuery !== undefined && incomingQuery !== null;
  useCallSound(ringingIn ? "incoming" : ringingOut ? "outgoing" : null);

  // ---- Reactive state transitions ----

  // Outgoing call got accepted (calleeSession appears) → go active + dial.
  useEffect(() => {
    if (
      state === "outgoing-ringing" &&
      outgoingQuery?.status === "active" &&
      outgoingQuery.calleeSession &&
      activeCallIdRef.current
    ) {
      setState("active");
      setPeer((p) => p ?? { name: outgoingQuery.peer.name });
      void (async () => {
        try {
          const stream = await ensureMic();
          const pc = createPeer(outgoingQuery._id, outgoingQuery.calleeSession as string);
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
        } catch (err) {
          console.warn("caller mic failed", err);
          void endCallM({ callId: outgoingQuery._id, outcome: "ended" });
          finish(true);
        }
      })();
    }
  }, [state, outgoingQuery, ensureMic, createPeer, endCallM, finish]);

  // Outgoing call vanished from the server (rejected / timed out).
  useEffect(() => {
    if (state === "outgoing-ringing" && outgoingQuery === null && activeCallIdRef.current) {
      finish(true);
    }
  }, [state, outgoingQuery, finish]);

  // My active call (either side) ended remotely.
  useEffect(() => {
    if (state !== "active" || !activeCallIdRef.current) return;
    const asCaller = outgoingQuery?._id === activeCallIdRef.current;
    const asCallee = calleeQuery?._id === activeCallIdRef.current;
    if (asCaller && outgoingQuery?.status !== "active") finish(false);
    else if (asCallee && calleeQuery?.status !== "active") finish(false);
    else if (!asCaller && !asCallee && !outgoingQuery && !calleeQuery) finish(false);
  }, [state, outgoingQuery, calleeQuery, finish]);

  // ---- Consume call signals ----
  useEffect(() => {
    if (!signals || signals.length === 0 || !activeCallIdRef.current) return;
    for (const signal of signals) {
      void (async () => {
        const pc = pcRef.current;
        const callId = activeCallIdRef.current;
        try {
          if (!pc || !callId) return;
          if (signal.kind === "offer" || signal.kind === "answer") {
            const desc = JSON.parse(signal.payload) as RTCSessionDescriptionInit;
            const offerCollision =
              desc.type === "offer" && (makingOfferRef.current || pc.signalingState !== "stable");
            ignoringOfferRef.current = !politeRef.current && offerCollision;
            if (ignoringOfferRef.current) return;
            await pc.setRemoteDescription(desc);
            remoteSetRef.current = true;
            const queued = candidateQueueRef.current.splice(0);
            for (const c of queued) await pc.addIceCandidate(c).catch(() => undefined);
            if (desc.type === "offer") {
              await pc.setLocalDescription();
              if (pc.localDescription) {
                sendSignal(callId, signal.fromSession, "answer", JSON.stringify(pc.localDescription.toJSON()));
              }
            }
          } else if (signal.kind === "ice") {
            const candidate = JSON.parse(signal.payload) as RTCIceCandidateInit;
            if (!remoteSetRef.current) {
              candidateQueueRef.current.push(candidate);
              return;
            }
            await pc.addIceCandidate(candidate).catch(() => undefined);
          }
        } catch (err) {
          console.warn("call signal failed", signal.kind, err);
        } finally {
          deleteSignal(signal._id);
        }
      })();
    }
  }, [signals, sendSignal, deleteSignal]);

  // Unmount safety: kill mic + peer when the hook goes away.
  useEffect(() => () => teardownPeer(), [teardownPeer]);

  const incoming: IncomingCall | null =
    state === "idle" && incomingQuery
      ? {
          callId: incomingQuery.callId,
          peerName: incomingQuery.peerName,
          peerAvatar: incomingQuery.peerAvatar,
          peerStatus: incomingQuery.peerStatus,
        }
      : null;

  return {
    state,
    peer: state === "idle" ? null : peer,
    incoming,
    start,
    accept,
    reject,
    hangUp,
    micOn,
    toggleMic,
    deafened,
    toggleDeafen,
  };
}
