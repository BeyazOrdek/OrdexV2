import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import {
  Clapperboard,
  Globe2,
  Hash,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { SettingsModal } from "@/components/SettingsModal";
import {
  FriendsPanel,
  type FriendsView,
} from "@/components/social/FriendsPanel";
import { MessagesPanel } from "@/components/social/MessagesPanel";
import {
  HomeSocialStage,
  setHomeSocialView,
  useHomeSocialView,
  useUnreadBadges,
} from "@/components/social/SocialOverlay";

/**
 * ÖRDEX home — a Discord-style standalone shell. Room management, DMs, groups
 * and friends all live here on full-screen surfaces; nothing requires joining
 * a room first. When a DM/group is opened it takes over the center stage
 * (full-width chat); closing it returns to the underlying home view.
 */
type HomeTab = "rooms" | "messages" | "friends";

const FRIENDS_VIEWS: { id: FriendsView; label: string }[] = [
  { id: "online", label: "Çevrimiçi" },
  { id: "all", label: "Tümü" },
  { id: "pending", label: "Bekleyenler" },
  { id: "add", label: "Arkadaş Ekle" },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<HomeTab>("rooms");
  const [friendsView, setFriendsView] = useState<FriendsView>("all");
  const [code, setCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];
  const joinRoom = useMutation(api.rooms.joinRoom);
  const badges = useUnreadBadges();
  // Reactive mirror of the full-screen DM/group stage (null = no chat open).
  // Dispatches land here because this component is mounted before any open
  // click happens, so the very first DM open is never missed.
  const socialView = useHomeSocialView();

  const goJoin = () => {
    const clean = code.trim().toUpperCase();
    if (clean.length === 6) {
      void joinRoom({ code: clean }).catch(() => undefined); // idempotent membership
      navigate(`/room/${clean}`);
    }
  };

  const avatar = user?.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.name ?? "Avatar"}
      className="size-8 shrink-0 rounded-full border border-white/15 object-cover"
    />
  ) : (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ background: `hsl(${avatarHue(user?._id ?? "x")} 65% 45%)` }}
    >
      {initials(user?.name ?? "Misafir")}
    </span>
  );

  const socialBadge = badges.dmTotal + badges.groupTotal;

  const navBtn = (active: boolean) =>
    `relative flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? "bg-[var(--ordex-panel-3)] text-white"
        : "text-[var(--ordex-muted)] hover:bg-[var(--ordex-panel-2)] hover:text-zinc-100"
    }`;

  return (
    <main className="ordex-bg flex h-screen flex-col overflow-hidden">
      {/* ================= Top navigation bar ================= */}
      <header className="ordex-panel flex h-14 shrink-0 items-center gap-2 border-b border-white/5 px-3">
        <button
          onClick={() => {
            setHomeSocialView(null);
            setTab("rooms");
          }}
          className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-white/5"
          title="Ana sayfa"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-[var(--ordex-accent)] text-white">
            <Clapperboard className="size-4" />
          </span>
          <span className="hidden text-sm font-black tracking-widest text-white sm:block">
            ÖRDEX
          </span>
        </button>

        <nav
          className="flex min-w-0 flex-1 items-center gap-1"
          aria-label="Ana gezinme"
        >
          <button
            onClick={() => {
              setHomeSocialView(null);
              setTab("rooms");
            }}
            className={navBtn(tab === "rooms")}
          >
            <Hash className="size-3.5 shrink-0" />
            <span className="truncate">Odalar</span>
          </button>
          <button
            onClick={() => {
              setHomeSocialView(null);
              setTab("messages");
            }}
            className={navBtn(tab === "messages")}
          >
            <MessageSquare className="size-3.5 shrink-0" />
            <span className="truncate">Mesajlar</span>
            {socialBadge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white">
                {socialBadge > 9 ? "9+" : socialBadge}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setHomeSocialView(null);
              setTab("friends");
            }}
            className={navBtn(tab === "friends")}
          >
            <Users className="size-3.5 shrink-0" />
            <span className="truncate">Arkadaşlar</span>
            {socialBadge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex size-2 rounded-full bg-red-600" />
            )}
          </button>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-white/5"
            title="Profil ve ayarlar"
          >
            {avatar}
            <span className="hidden text-sm text-zinc-300 sm:block">
              {user?.name ?? "Misafir"}
            </span>
          </button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
            title="Ayarlar (profil, tema, hesap)"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-red-400"
            title="Çıkış"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {/* ================= Body ================= */}
      <div className="flex min-h-0 flex-1">
        {/* List column: full width on phones (Discord mobile behavior),
            288px rail on sm+; hidden entirely while a chat is open. */}
        {!socialView && (
          <aside className="ordex-panel flex w-full min-w-0 shrink-0 flex-col border-r border-white/5 sm:w-72">
            {tab === "rooms" && (
              <>
                <div className="border-b border-white/5 p-3">
                  <div className="flex gap-2">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === "Enter" && goJoin()}
                      placeholder="Oda kodu..."
                      maxLength={6}
                      className="ordex-inset h-9 border-white/10 text-sm uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal placeholder:text-zinc-500 focus-visible:ring-[var(--ordex-accent)]/40"
                    />
                    <Button
                      size="sm"
                      onClick={goJoin}
                      disabled={code.trim().length !== 6}
                      className="h-9 shrink-0 bg-[var(--ordex-accent)] px-3 text-white hover:bg-[var(--ordex-accent-hover)]"
                    >
                      Katıl
                    </Button>
                  </div>
                  <Button
                    onClick={() => setCreateOpen(true)}
                    variant="outline"
                    className="ordex-inset mt-2 w-full justify-start gap-2 border-white/10 text-sm hover:bg-[var(--ordex-panel-3)] hover:text-white"
                  >
                    <Plus className="size-4" /> Oda oluştur
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
                    Odalarım
                  </p>
                  {myRooms.length === 0 && (
                    <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
                      Henüz oda yok.
                    </p>
                  )}
                  {myRooms.map((room) =>
                    room ? (
                      <RoomLink
                        key={room._id}
                        code={room.code}
                        name={room.name}
                        secret={room.visibility === "secret"}
                      />
                    ) : null,
                  )}
                  <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
                    Herkese açık odalar
                  </p>
                  {publicRooms
                    .filter((r) => !myRooms.some((m) => m?._id === r._id))
                    .slice(0, 12)
                    .map((room) => (
                      <RoomLink
                        key={room._id}
                        code={room.code}
                        name={room.name}
                      />
                    ))}
                  {publicRooms.length === 0 && (
                    <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">
                      Keşfedilecek oda yok.
                    </p>
                  )}
                </div>
              </>
            )}

            {tab === "messages" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <p className="border-b border-white/5 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
                  Direkt Mesajlar & Gruplar
                </p>
                <div className="min-h-0 flex-1">
                  <MessagesPanel />
                </div>
              </div>
            )}

            {tab === "friends" && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="ordex-panel-2 grid grid-cols-2 gap-1 border-b border-white/5 p-1.5">
                  {FRIENDS_VIEWS.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setFriendsView(v.id)}
                      className={`rounded px-2 py-1.5 text-[11px] font-medium transition-colors ${
                        friendsView === v.id
                          ? "bg-[var(--ordex-panel-3)] text-white"
                          : "text-[var(--ordex-muted)] hover:bg-[var(--ordex-panel-2)] hover:text-zinc-100"
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
                <div className="min-h-0 flex-1">
                  <FriendsPanel view={friendsView} />
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Center stage: an open DM/group takes over completely (full width
            on phones too); without a chat it is hidden on phones because the
            list column IS the mobile home view. */}
        <div
          className={
            socialView
              ? "flex min-w-0 flex-1 flex-col"
              : "hidden min-w-0 flex-1 flex-col sm:flex"
          }
        >
          {socialView ? (
            <HomeSocialStage view={socialView} />
          ) : (
            <>
              {tab === "rooms" && (
                <RoomsStage
                  onCreate={() => setCreateOpen(true)}
                  onJoin={goJoin}
                  code={code}
                  setCode={setCode}
                  joinDisabled={code.trim().length !== 6}
                />
              )}
              {tab === "messages" && <MessagesEmptyState />}
              {tab === "friends" && <FriendsEmptyState view={friendsView} />}
            </>
          )}
        </div>
      </div>

      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}

/** Center content for the rooms tab (hidden while a full-screen DM is open). */
function RoomsStage({
  onCreate,
  onJoin,
  code,
  setCode,
  joinDisabled,
}: {
  onCreate: () => void;
  onJoin: () => void;
  code: string;
  setCode: (v: string) => void;
  joinDisabled: boolean;
}) {
  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];
  return (
    <div className="ordex-bg min-h-0 flex-1 overflow-y-auto p-6 [scrollbar-width:thin]">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          Birlikte izle, birlikte konuş.
        </h1>
        <p className="mt-1 text-sm text-[var(--ordex-muted)]">
          Oda kur, kodla davet et, sesli kanala bağlan — video herkes için
          senkron akar.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="ordex-panel-2 rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Plus className="size-4 text-[var(--ordex-accent)]" /> Yeni oda
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Herkese açık ya da gizli (davet kodlu) oda oluştur.
            </p>
            <Button
              onClick={onCreate}
              className="mt-3 h-10 w-full gap-2 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
            >
              Oda oluştur
            </Button>
          </div>

          <div className="ordex-panel-2 rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Users className="size-4 text-[var(--ordex-accent)]" /> Kodla
              katıl
            </div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && onJoin()}
              placeholder="6 haneli oda kodu"
              maxLength={6}
              className="ordex-inset mt-3 h-10 border-white/10 font-mono text-sm uppercase tracking-[0.3em] placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-500 focus-visible:ring-[var(--ordex-accent)]/40"
            />
            <Button
              onClick={onJoin}
              disabled={joinDisabled}
              variant="outline"
              className="ordex-inset mt-3 h-10 w-full gap-2 border-white/10 text-sm hover:bg-[var(--ordex-panel-3)]"
            >
              Odaya gir →
            </Button>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Odalarım
          </h2>
          {myRooms.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">
              Henüz bir odaya katılmadın. Yukarıdan yeni bir oda kur.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myRooms.map(
                (room) =>
                  room && (
                    <RoomCard
                      key={room._id}
                      code={room.code}
                      name={room.name}
                    />
                  ),
              )}
            </div>
          )}
        </section>

        <section className="mt-8 pb-10">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Globe2 className="size-3.5" /> Herkese açık odalar
          </h2>
          {publicRooms.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">Keşfedilecek oda yok.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {publicRooms.slice(0, 12).map((room) => (
                <RoomCard key={room._id} code={room.code} name={room.name} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MessagesEmptyState() {
  return (
    <div className="ordex-bg flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ordex-panel-2)] text-[var(--ordex-muted)]">
        <MessageSquare className="size-6" />
      </span>
      <p className="text-sm font-semibold text-zinc-200">
        Hiç sohbet açık değil
      </p>
      <p className="max-w-xs text-xs text-[var(--ordex-muted)]">
        Soldaki listenden bir kişiye tıklayarak DM başlat, ya da grup sohbeti
        aç. Mesajların burada, tam ekran olarak görünür.
      </p>
    </div>
  );
}

function FriendsEmptyState({ view }: { view: FriendsView }) {
  const label =
    view === "pending"
      ? "Bekleyen arkadaş isteklerini soldan yönet."
      : view === "add"
        ? "Soldaki arama kutusuna bir kullanıcı adı yaz ve istek gönder."
        : "Soldaki listeden bir arkadaşına DM gönder veya sesli ara.";
  return (
    <div className="ordex-bg flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ordex-panel-2)] text-[var(--ordex-muted)]">
        <Users className="size-6" />
      </span>
      <p className="text-sm font-semibold text-zinc-200">
        Wumpus seni bekliyor
      </p>
      <p className="max-w-xs text-xs text-[var(--ordex-muted)]">{label}</p>
    </div>
  );
}

function RoomCard({ code, name }: { code: string; name: string }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/room/${code}`)}
      className="ordex-panel-2 group rounded-xl border border-white/5 p-4 text-left transition-colors hover:border-[var(--ordex-accent)]/40 hover:bg-[var(--ordex-panel-3)]"
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-white/5 text-zinc-300">
          <Hash className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
          {name}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="ordex-chip rounded px-2 py-0.5 font-mono text-[11px] tracking-widest">
          {code}
        </span>
        <span className="text-xs text-zinc-500 transition-colors group-hover:text-[var(--ordex-accent)]">
          Katıl →
        </span>
      </div>
    </button>
  );
}

function RoomLink({
  code,
  name,
  secret,
}: {
  code: string;
  name: string;
  secret?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/room/${code}`)}
      className="mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-[var(--ordex-panel-2)] hover:text-white"
    >
      {secret ? (
        <Lock className="size-4 shrink-0 text-[var(--ordex-muted)]" />
      ) : (
        <Hash className="size-4 shrink-0 text-[var(--ordex-muted)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="ordex-chip shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
        {code}
      </span>
    </button>
  );
}
