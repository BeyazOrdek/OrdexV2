import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";

export interface PresenceOptions {
  roomId: Id<"rooms">;
  sessionId: string;
  userName: string;
  avatarHue: number;
  inVoice: boolean;
  micOn: boolean;
  camOn: boolean;
  isSharing?: boolean;
}

const HEARTBEAT_MS = 10_000;
const FRESH_MS = 35_000;

export function useRoomPresence({
  roomId,
  sessionId,
  userName,
  avatarHue,
  inVoice,
  micOn,
  camOn,
  isSharing = false,
}: PresenceOptions) {
  const heartbeat = useMutation(api.presence.heartbeat);
  const presenceRows = useQuery(api.presence.listPresence, { roomId });

  const infoRef = useRef({ sessionId, userName, avatarHue });
  infoRef.current = { sessionId, userName, avatarHue };
  const voiceRef = useRef({ inVoice, micOn, camOn, isSharing });
  voiceRef.current = { inVoice, micOn, camOn, isSharing };

  // Immediate heartbeat whenever voice state changes + periodic keepalive.
  useEffect(() => {
    let cancelled = false;
    const beat = () => {
      if (cancelled) return;
      const { sessionId: sid, userName: name, avatarHue: hue } = infoRef.current;
      const v = voiceRef.current;
      void heartbeat({
        roomId,
        sessionId: sid,
        userName: name,
        avatarHue: hue,
        inVoice: v.inVoice,
        micOn: v.micOn,
        camOn: v.camOn,
        isSharing: v.isSharing,
      }).catch(() => undefined);
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, heartbeat, inVoice, micOn, camOn, isSharing]);

  // Best-effort explicit leave on unmount.
  const leave = useMutation(api.presence.leave);
  useEffect(() => {
    return () => {
      void leave({ sessionId }).catch(() => undefined);
    };
  }, [leave, sessionId]);

  // Re-render periodically so stale sessions drop off the list even when
  // Convex data hasn't changed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const participants = (presenceRows ?? []).filter(
    (row) => now - row.lastSeen < FRESH_MS,
  );
  const voiceSessions = participants.filter((row) => row.inVoice);

  return { participants, voiceSessions };
}
