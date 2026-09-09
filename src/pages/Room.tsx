import { ChatPanel } from "@/components/room/ChatPanel";
import { LeftPanel } from "@/components/room/LeftPanel";
import { MediaPanel } from "@/components/room/MediaPanel";
import { GamingStage } from "@/components/room/GamingStage";
import { RightPanel } from "@/components/room/RightPanel";
import { MobileNav, type MobileTab } from "@/components/room/MobileNav";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { useRoomPresence } from "@/hooks/use-room-presence";
import { useVoice } from "@/hooks/use-voice";
import { useMediaSync } from "@/hooks/use-media-sync";
import { useIsMobile } from "@/hooks/use-mobile";
import { avatarHue, getSessionId, type ParsedMediaLink } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import { DoorOpen, Home, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Button } from "@/components/ui/button";

export default function Room() {
  const { code = "" } = useParams<{ code: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
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

  // useQuery: undefined = still loading, null = the room definitively does
  // not exist (auto-deleted when it emptied, or a wrong/expired code). This
  // MUST be distinguished — treating null as "loading" spun here forever,
  // because roomClosed detection only runs inside the (never-mounted) view.
  if (room === null) {
    return (
      <main className="ordex-bg flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
          <DoorOpen className="size-7" />
        </span>
        <div>
          <p className="text-lg font-semibold text-white">Oda bulunamadı</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--ordex-muted)]">
            Bu oda kapandığı için silindi ya da kod hatalı. Yeni bir oda oluşturabilir veya kodu
            tekrar kontrol edebilirsin.
          </p>
        </div>
        <Button
          onClick={() => navigate("/")}
          className="gap-2 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
        >
          <Home className="size-4" /> Ana sayfaya dön
        </Button>
      </main>
    );
  }

  if (!roomId || room === undefined) {
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
      roomType={room.roomType ?? "cinema"}
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
  roomType,
  sessionId,
  userName,
  userId,
}: {
  roomId: Id<"rooms">;
  roomCode: string;
  roomName: string;
  roomType: "cinema" | "gaming";
  sessionId: string;
  userName: string;
  userId: string;
}) {
  const navigate = useNavigate();
  // Voice UI state mirrored up so presence heartbeats reflect it.
  const [voiceUi, setVoiceUi] = useState({ inVoice: false, micOn: true, camOn: true, isSharing: false });

  // Dedicated host nodes for the media layers (kept out of the sync object so
  // consumers never read refs during render).
  const stageRef = useRef<HTMLDivElement | null>(null);
  const ytHostRef = useRef<HTMLDivElement | null>(null);
  const syncVideoRef = useRef<HTMLVideoElement | null>(null);

  const presence = useRoomPresence({
    roomId,
    sessionId,
    userName,
    avatarHue: avatarHue(userId),
    inVoice: voiceUi.inVoice,
    micOn: voiceUi.micOn,
    camOn: voiceUi.camOn,
    isSharing: voiceUi.isSharing,
  });
  const { roomClosed } = presence;

  const voice = useVoice({
    roomId,
    sessionId,
    voiceSessions: presence.voiceSessions,
    onVoiceStateChange: setVoiceUi,
  });

  const sync = useMediaSync({
    roomId: roomId as Id<"rooms">,
    sessionId,
    onEnded: () => undefined,
    stageRef,
    ytHostRef,
    videoRef: syncVideoRef,
  });
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

  // Cinema mode: hide both side panels so the video fills the screen.
  const [cinema, setCinema] = useState(false);
  const toggleCinema = useCallback(() => setCinema((v) => !v), []);

  // Mobile: bottom nav switches between stage / chat / voice / friends panels.
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>("stage");

  const rightPanel = (
    <div className="flex h-full min-h-0 w-full flex-col border-white/5">
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
  );

  // Auto room cleanup: when the last occupant leaves, the backend deletes the
  // room and everyone's reactive lists update. Occupants still inside get a
  // clear "room closed" screen instead of a broken shell.
  if (roomClosed) {
    return (
      <main className="ordex-bg flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
          <DoorOpen className="size-7" />
        </span>
        <div>
          <p className="text-lg font-semibold text-white">Oda kapandı</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--ordex-muted)]">
            Odadaki son kişi ayrıldığı için oda otomatik olarak silindi.
          </p>
        </div>
        <Button
          onClick={() => navigate("/")}
          className="gap-2 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
        >
          <Home className="size-4" /> Ana sayfaya dön
        </Button>
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground">
      {!cinema && !isMobile && (
        <div className="w-60 shrink-0">
          <LeftPanel activeCode={roomCode} />
        </div>
      )}

      <div className="min-w-0 flex-1 pb-16 md:pb-0">
        {isMobile ? (
          mobileTab === "stage" ? (
            roomType === "gaming" ? (
              <GamingStage
                roomName={roomName}
                roomCode={roomCode}
                participants={voice.participants}
                inVoice={voice.inVoice}
                micOn={voice.micOn}
                isSharing={voice.isSharing}
                localStream={voice.localStream}
                remoteStreams={voice.remoteStreams}
                onJoinVoice={() => void voice.join()}
                onLeaveVoice={voice.leave}
                onToggleMic={voice.toggleMic}
                onStartShare={voice.startScreenShare}
                onStopShare={voice.stopScreenShare}
                cinemaMode={cinema}
                onToggleCinema={toggleCinema}
              />
            ) : (
              <MediaPanel
                roomName={roomName}
                roomCode={roomCode}
                sync={sync}
                stageRef={stageRef}
                ytHostRef={ytHostRef}
                videoRef={syncVideoRef}
                onAddLink={addLink}
                onNext={skipToNext}
                localStream={voice.localStream}
                camOn={voice.camOn}
                cinemaMode={cinema}
                onToggleCinema={toggleCinema}
              />
            )
          ) : mobileTab === "chat" ? (
            <ChatPanel roomId={roomId} />
          ) : mobileTab === "voice" ? (
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
          ) : (
            <div className="ordex-panel h-full border-r border-white/5">
              <LeftPanel activeCode={roomCode} />
            </div>
          )
        ) : roomType === "gaming" ? (
          <GamingStage
            roomName={roomName}
            roomCode={roomCode}
            participants={voice.participants}
            inVoice={voice.inVoice}
            micOn={voice.micOn}
            isSharing={voice.isSharing}
            localStream={voice.localStream}
            remoteStreams={voice.remoteStreams}
            onJoinVoice={() => void voice.join()}
            onLeaveVoice={voice.leave}
            onToggleMic={voice.toggleMic}
            onStartShare={voice.startScreenShare}
            onStopShare={voice.stopScreenShare}
            cinemaMode={cinema}
            onToggleCinema={toggleCinema}
          />
        ) : (
          <MediaPanel
            roomName={roomName}
            roomCode={roomCode}
            sync={sync}
            stageRef={stageRef}
            ytHostRef={ytHostRef}
            videoRef={syncVideoRef}
            onAddLink={addLink}
            onNext={skipToNext}
            localStream={voice.localStream}
            camOn={voice.camOn}
            cinemaMode={cinema}
            onToggleCinema={toggleCinema}
          />
        )}
      </div>

      {!cinema && !isMobile && (
        <div className="flex w-80 shrink-0 flex-col border-l border-white/5">{rightPanel}</div>
      )}

      {isMobile && (
        <MobileNav
          tab={mobileTab}
          onTabChange={setMobileTab}
          voiceCount={voice.participants.length}
        />
      )}
    </main>
  );
}
