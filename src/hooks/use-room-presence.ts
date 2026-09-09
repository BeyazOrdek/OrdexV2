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
const CLEANUP_EVERY_MS = 20_000;

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

  // Set when the backend reports the room was auto-deleted (everyone left),
  // or the local session left — Room.tsx shows a "room closed" screen.
  const [roomClosed, setRoomClosed] = useState(false);

  const infoRef = useRef({ sessionId, userName, avatarHue });
  const voiceRef = useRef({ inVoice, micOn, camOn, isSharing });
  // Mirror props into refs inside effects (refs must not be written during render).
  useEffect(() => {
    infoRef.current = { sessionId, userName, avatarHue };
  }, [sessionId, userName, avatarHue]);
  useEffect(() => {
    voiceRef.current = { inVoice, micOn, camOn, isSharing };
  }, [inVoice, micOn, camOn, isSharing]);

  // Immediate heartbeat whenever voice state changes + periodic keepalive.
  // A "ROOM_CLOSED" rejection means the room was auto-deleted meanwhile.
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
      }).catch((err) => {
        if (String(err).includes("ROOM_CLOSED")) setRoomClosed(true);
      });
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

  // Auto room cleanup sweep: while someone is in a room, periodically ask the
  // backend to delete rooms whose occupants have all gone stale (crashed tabs
  // / dropped connections never fire a proper leave). Reactive room lists
  // remove the deleted rooms everywhere instantly.
  const cleanupStaleRooms = useMutation(api.rooms.cleanupStaleRooms);
  useEffect(() => {
    if (roomClosed) return;
    void cleanupStaleRooms({}).catch(() => undefined);
    const interval = setInterval(() => {
      void cleanupStaleRooms({}).catch(() => undefined);
    }, CLEANUP_EVERY_MS);
    return () => clearInterval(interval);
  }, [roomClosed, cleanupStaleRooms]);

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

  return { participants, voiceSessions, roomClosed };
}
