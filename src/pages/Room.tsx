import { ChatPanel } from "@/components/room/ChatPanel";
import { LeftPanel } from "@/components/room/LeftPanel";
import { MediaPanel } from "@/components/room/MediaPanel";
import { RightPanel } from "@/components/room/RightPanel";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useRoomPresence } from "@/hooks/use-room-presence";
import { useVoice } from "@/hooks/use-voice";
import { useMediaSync } from "@/hooks/use-media-sync";
import { avatarHue, getSessionId, type ParsedMediaLink } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";

export default function Room() {
  const { code = "" } = useParams<{ code: string }>();
  const { user } = useAuth();
  const sessionId = useMemo(() => getSessionId(), []);

  const joinRoom = useMutation(api.rooms.joinRoom);
  const [roomId, setRoomId] = useState<Id<"rooms"> | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Resolve/join the room by code (idempotent membership).
  const joinedRef = useRef<string>("");
  useEffect(() => {
    const clean = code.trim().toUpperCase();
    if (!clean || joinedRef.current === clean) return;
    joinedRef.current = clean;
    joinRoom({ code: clean })
      .then((r) => {
        setRoomId(r.roomId);
        setJoinError(null);
      })
      .catch((err) => setJoinError(err instanceof Error ? err.message : "Odaya katılınamadı."));
  }, [code, joinRoom]);

  const room = useQuery(api.rooms.getRoomByCode, { code: code.toUpperCase() });

  if (joinError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-red-400">Odaya girilemedi</p>
          <p className="mt-1 text-sm text-muted-foreground">{joinError}</p>
        </div>
      </main>
    );
  }

  if (!roomId || !room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Odaya bağlanılıyor...
        </div>
      </main>
    );
  }

  return (
    <RoomView
      roomId={roomId}
      roomCode={room.code}
      roomName={room.name}
      sessionId={sessionId}
      userName={user?.name ?? "Misafir"}
      userId={user?._id ?? "anon"}
    />
  );
}

function RoomView({
  roomId,
  roomCode,
  roomName,
  sessionId,
  userName,
  userId,
}: {
  roomId: Id<"rooms">;
  roomCode: string;
  roomName: string;
  sessionId: string;
  userName: string;
  userId: string;
}) {
  // Voice UI state mirrored up so presence heartbeats reflect it.
  const [voiceUi, setVoiceUi] = useState({ inVoice: false, micOn: true, camOn: true });

  const presence = useRoomPresence({
    roomId,
    sessionId,
    userName,
    avatarHue: avatarHue(userId),
    inVoice: voiceUi.inVoice,
    micOn: voiceUi.micOn,
    camOn: voiceUi.camOn,
  });

  const voice = useVoice({
    roomId,
    sessionId,
    voiceSessions: presence.voiceSessions,
    onVoiceStateChange: setVoiceUi,
  });

  const sync = useMediaSync({ roomId, sessionId, onEnded: () => undefined });
  const advanceQueue = useMutation(api.rooms.advanceQueue);
  const addToQueue = useMutation(api.rooms.addToQueue);

  // Auto-advance the queue when a video ends (any media type).
  const endedRef = useRef<string>("");
  useEffect(() => {
    if (!sync.endedMediaKey || endedRef.current === sync.endedMediaKey) return;
    endedRef.current = sync.endedMediaKey;
    void advanceQueue({ roomId, finishedVideoId: sync.endedMediaKey }).catch(() => undefined);
  }, [sync.endedMediaKey, roomId, advanceQueue]);

  const addLink = useCallback(
    (media: ParsedMediaLink) => {
      void addToQueue({
        roomId,
        videoId: media.key,
        mediaType: media.type,
        mediaUrl: media.url,
        title: media.title,
        thumb: media.thumb,
      }).catch(() => undefined);
    },
    [roomId, addToQueue],
  );

  const skipToNext = useCallback(() => {
    if (!sync.currentVideoId) return;
    void advanceQueue({ roomId, finishedVideoId: sync.currentVideoId }).catch(() => undefined);
  }, [roomId, advanceQueue, sync.currentVideoId]);

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground">
      <div className="hidden w-60 shrink-0 md:block">
        <LeftPanel activeCode={roomCode} />
      </div>
      <div className="min-w-0 flex-1">
        <MediaPanel
          roomName={roomName}
          roomCode={roomCode}
          sync={sync}
          onAddLink={addLink}
          onNext={skipToNext}
          localStream={voice.localStream}
          camOn={voice.camOn}
        />
      </div>
      <div className="flex w-80 shrink-0 flex-col border-l border-white/5">
        <div className="min-h-0 flex-[3] border-b border-white/5">
          <ChatPanel roomId={roomId} />
        </div>
        <div className="min-h-0 flex-[4]">
          <RightPanel
            roomId={roomId}
            sessionId={sessionId}
            participants={presence.participants}
            voiceParticipants={voice.participants}
            inVoice={voice.inVoice}
            micOn={voice.micOn}
            camOn={voice.camOn}
            voiceError={voice.error}
            onJoinVoice={() => void voice.join()}
            onLeaveVoice={voice.leave}
            onToggleMic={voice.toggleMic}
            onToggleCam={voice.toggleCam}
          />
        </div>
      </div>
    </main>
  );
}
