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
import { reportActiveRoom, type PublicUserLite } from "@/components/social/SocialOverlay";
import { useMutation, useQuery } from "convex/react";
import { DoorOpen, Home, Loader2, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { useAutoAfk } from "@/hooks/use-auto-afk";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";

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

  return (      <RoomView
        roomId={roomId}
        roomCode={room.code}
        roomName={room.name}
        roomType={room.roomType ?? "cinema"}
        sessionId={sessionId}
        userName={user?.name ?? "Misafir"}
        userId={user?._id ?? "anon"}
        ownerId={room.createdByUserId}
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
  ownerId,
}: {
  roomId: Id<"rooms">;
  roomCode: string;
  roomName: string;
  roomType: "cinema" | "gaming";
  sessionId: string;
  userName: string;
  userId: string;
  ownerId: Id<"users">;
}) {
  const navigate = useNavigate();
  // 😴 Global auto-AFK watcher (5 dk hareketsizlik → Boşta 🌙).
  useAutoAfk();
  // Voice UI state mirrored up so presence heartbeats reflect it.
  const [voiceUi, setVoiceUi] = useState({ inVoice: false, micOn: true, camOn: true, isSharing: false });

  /** Leave: kill voice/WebRTC, clear presence, then head back to the home page. */
  const leaveRoom = useCallback(() => {
    navigate("/");
  }, [navigate]);

  // Dedicated host nodes for the media layers (kept out of the sync object so
  // consumers never read refs during render).
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
  const { roomClosed, kicked, participants } = presence;

  // Tell the global social layer which room is open (mention/unread counting).
  useEffect(() => {
    reportActiveRoom(roomId);
    return () => reportActiveRoom(undefined);
  }, [roomId]);

  const voice = useVoice({
    roomId,
    sessionId,
    voiceSessions: presence.voiceSessions,
    onVoiceStateChange: setVoiceUi,
  });

  // 🖱️ Owner-only context-menu extras: remove a member from the room.
  const isOwner = ownerId === userId;
  const kickFromRoom = useMutation(api.rooms.kickFromRoom);
  const handleKickUser = useCallback(
    (target: { userId: string; userName: string; sessionId: string }) => {
      void kickFromRoom({
        roomId,
        sessionId: target.sessionId,
        userId: target.userId as Id<"users">,
        userName: target.userName,
      }).catch(() => undefined);
      toast.info(`${target.userName} odadan atıldı.`);
    },
    [roomId, kickFromRoom],
  );

  // 👤 Public profiles for context-menu profile cards.
  const memberIds = useMemo(
    () => [...new Set(participants.map((p) => p.userId))] as Id<"users">[],
    [participants],
  );
  const publicRows = useQuery(
    api.users.getUsersPublic,
    memberIds.length > 0 ? { userIds: memberIds } : "skip",
  );
  const publicUserFor = useCallback(
    (uid: string): PublicUserLite | undefined =>
      (publicRows ?? []).find((p) => String(p._id) === uid),
    [publicRows],
  );

  const sync = useMediaSync({
    roomId: roomId as Id<"rooms">,
    sessionId,
    onEnded: () => undefined,
    videoRef: syncVideoRef,
  });
  const ytHostRef = sync.ytHostRef;
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
          participants={participants}
          voiceParticipants={voice.participants}
          inVoice={voice.inVoice}
          micOn={voice.micOn}
          camOn={voice.camOn}
          voiceError={voice.error}
          onJoinVoice={() => void voice.join()}
          onLeaveVoice={voice.leave}
          onToggleMic={voice.toggleMic}
          onToggleCam={voice.toggleCam}
          krisp={voice.krisp}
          onToggleKrisp={() => void voice.toggleKrisp()}
          getPeerVolume={voice.getPeerVolume}
          setPeerVolume={voice.setPeerVolume}
          isOwner={isOwner}
          onKickUser={handleKickUser}
          publicUserFor={publicUserFor}
        />
      </div>
    </div>
  );

  // 🚪 The owner removed this user — show a dedicated kicked screen.
  if (kicked) {
    return (
      <main className="ordex-bg flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
          <ShieldAlert className="size-7" />
        </span>
        <div>
          <p className="text-lg font-semibold text-white">Odadan atıldın</p>
          <p className="mt-1 max-w-sm text-sm text-[var(--ordex-muted)]">
            Oda sahibi seni bu odadan çıkardı. Ses bağlantın kapatıldı.
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

  // Cinema mode collapses both side panels to zero (the stage itself stays
  // mounted — unmounting it would kill the YouTube player lifecycle).
  const leftPanelRef = useRef<ImperativePanelHandle | null>(null);
  const rightPanelRef = useRef<ImperativePanelHandle | null>(null);
  useEffect(() => {
    if (isMobile) return;
    if (cinema) {
      leftPanelRef.current?.collapse();
      rightPanelRef.current?.collapse();
    } else {
      // Restore only panels that are actually collapsed, so a user-chosen
      // manual size is never snapped back.
      if ((leftPanelRef.current?.getSize() ?? 16) < 1) leftPanelRef.current?.resize(16);
      if ((rightPanelRef.current?.getSize() ?? 25) < 1) rightPanelRef.current?.resize(25);
    }
  }, [cinema, isMobile]);

  const stage =
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
        ytHostRef={ytHostRef}
        videoRef={syncVideoRef}
        onAddLink={addLink}
        onNext={skipToNext}
        localStream={voice.localStream}
        camOn={voice.camOn}
        cinemaMode={cinema}
        onToggleCinema={toggleCinema}
      />
    );

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground">
      {!isMobile ? (
        /* Desktop: draggable splitters between left / stage / right. The stage
           always lives in the middle panel so it NEVER unmounts — cinema mode
           just collapses the side panels via imperative handles. */
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel
            ref={leftPanelRef as never}
            id="ordex-left"
            order={1}
            defaultSize={16}
            minSize={10}
            maxSize={30}
            collapsible
            collapsedSize={0}
            className="overflow-hidden"
          >
            <LeftPanel activeCode={roomCode} onLeaveRoom={leaveRoom} />
          </ResizablePanel>
          <ResizableHandle
            className={cn(
              "w-1 bg-transparent transition-colors hover:bg-[var(--ordex-accent)]/40",
              cinema && "pointer-events-none opacity-0",
            )}
            withHandle={!cinema}
          />
          <ResizablePanel id="ordex-center" order={2} defaultSize={59} minSize={35}>
            {stage}
          </ResizablePanel>
          <ResizableHandle
            className={cn(
              "w-1 bg-transparent transition-colors hover:bg-[var(--ordex-accent)]/40",
              cinema && "pointer-events-none opacity-0",
            )}
            withHandle={!cinema}
          />
          <ResizablePanel
            ref={rightPanelRef as never}
            id="ordex-right"
            order={3}
            defaultSize={25}
            minSize={14}
            maxSize={40}
            collapsible
            collapsedSize={0}
            className="overflow-hidden"
          >
            {rightPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="min-w-0 flex-1 pb-16">
          {mobileTab === "stage" ? (
            stage
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
              krisp={voice.krisp}
              onToggleKrisp={() => void voice.toggleKrisp()}
              getPeerVolume={voice.getPeerVolume}
              setPeerVolume={voice.setPeerVolume}
              isOwner={isOwner}
              onKickUser={handleKickUser}
              publicUserFor={publicUserFor}
            />
          ) : (
            <div className="ordex-panel h-full border-r border-white/5">
              <LeftPanel activeCode={roomCode} onLeaveRoom={leaveRoom} />
            </div>
          )}
        </div>
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
