import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import {
  Compass,
  Hash,
  Lock,
  LogOut,
  MessageSquare,
  Pencil,
  Plus,
  Settings,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { SettingsModal } from "@/components/SettingsModal";
import { CountBadge, useUnreadBadges } from "@/components/social/SocialOverlay";
import { FriendsPanel, type FriendsView } from "@/components/social/FriendsPanel";
import { MessagesPanel } from "@/components/social/MessagesPanel";

/**
 * Left panel with a Discord-style TOP NAVIGATION BAR (ÖRDEX rev.4):
 * - 📢 Odalar    → room create/join + room lists
 * - 💬 Mesajlar  → DM contacts + group chats (MessagesPanel)
 * - 👥 Arkadaşlar→ FriendsPanel with Discord sub-tabs
 *      (Çevrimiçi / Tümü / Bekleyenler / Arkadaş Ekle)
 * Clicking a top tab swaps the panel content below it; the room/media stage
 * is untouched, exactly like Discord's friend/nav bar over the main view.
 */
type Tab = "rooms" | "messages" | "friends";

const FRIENDS_VIEWS: { id: FriendsView; label: string; icon?: typeof UserPlus }[] = [
  { id: "online", label: "Çevrimiçi" },
  { id: "all", label: "Tümü" },
  { id: "pending", label: "Bekleyenler" },
  { id: "add", label: "Arkadaş Ekle", icon: UserPlus },
];

export function LeftPanel({ activeCode }: { activeCode?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("rooms");
  const [friendsView, setFriendsView] = useState<FriendsView>("all");
  const [code, setCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];
  const joinRoom = useMutation(api.rooms.joinRoom);
  const badges = useUnreadBadges();
  const roomBadges = useQuery(api.dms.listRoomUnread, {}) ?? [];
  // Pending incoming requests — drives the "Bekleyenler" sub-tab badge
  // (same reactive query FriendsPanel uses; Convex dedupes the subscription).
  const pendingRequests = useQuery(api.social.listIncomingRequests, {}) ?? [];
  const unreadFor = (roomId: string) =>
    roomBadges.find((r) => String(r.roomId) === String(roomId));

  const openFriends = (view: FriendsView) => {
    setTab("friends");
    setFriendsView(view);
  };

  const goJoin = () => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    void joinRoom({ code: clean })
      .then(() => navigate(`/room/${clean}`))
      .catch(() => navigate(`/room/${clean}`)); // joinRoom is idempotent; navigate regardless
  };

  const socialBadge = badges.dmTotal + badges.groupTotal;

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

  const navBtn = (active: boolean) =>
    cn(
      "relative flex min-w-0 items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-semibold transition-colors",
      active
        ? "bg-[var(--ordex-panel-3)] text-white"
        : "text-[var(--ordex-muted)] hover:bg-[var(--ordex-panel-2)] hover:text-zinc-100",
    );

  return (
    <aside className="ordex-panel flex h-full w-full flex-col text-zinc-200">
      {/* ================= Top navigation bar (Discord-style) ================= */}
      <nav className="shrink-0 border-b border-white/5 p-1.5" aria-label="Ana gezinme">
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => setTab("rooms")}
            className={navBtn(tab === "rooms")}
            title="Odalar — oda kur, katıl, keşfet"
          >
            <Hash className="size-3.5 shrink-0" />
            <span className="truncate">Odalar</span>
          </button>
          <button
            onClick={() => setTab("messages")}
            className={navBtn(tab === "messages")}
            title="Direkt Mesajlar ve gruplar"
          >
            <MessageSquare className="size-3.5 shrink-0" />
            <span className="truncate">Mesajlar</span>
            {socialBadge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-red-600 px-0.5 text-[8px] font-bold leading-none text-white">
                {socialBadge > 9 ? "9+" : socialBadge}
              </span>
            )}
          </button>
          <button
            data-ordex-friends-tab
            onClick={() => openFriends("all")}
            className={navBtn(tab === "friends")}
            title="Arkadaşlar"
          >
            <Users className="size-3.5 shrink-0" />
            <span className="truncate">Arkadaşlar</span>
            {(badges.dmTotal > 0 || badges.groupTotal > 0) && (
              <span className="absolute right-0.5 top-0.5 flex size-2 items-center justify-center rounded-full bg-red-600" />
            )}
          </button>
        </div>

        {/* Friends sub-navigation (Çevrimiçi / Tümü / Bekleyenler / Arkadaş Ekle) */}
        {tab === "friends" && (
          <div className="ordex-inset mt-1.5 grid grid-cols-2 gap-0.5 rounded-md p-1">
            {FRIENDS_VIEWS.map((v) => {
              const Icon = v.icon;
              const count = v.id === "pending" ? pendingRequests.length : 0;
              return (
                <button
                  key={v.id}
                  onClick={() => setFriendsView(v.id)}
                  className={cn(
                    "relative flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium transition-colors",
                    friendsView === v.id
                      ? "bg-[var(--ordex-panel-3)] text-white"
                      : "text-[var(--ordex-muted)] hover:bg-[var(--ordex-panel-2)] hover:text-zinc-100",
                  )}
                >
                  {Icon && <Icon className="size-3 shrink-0" />}
                  <span className="truncate">{v.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-[var(--ordex-accent)] px-1 text-[8px] font-bold leading-3 text-white">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {tab === "rooms" ? (
        <>
          {/* Search / quick join */}
          <div className="border-b border-white/5 p-3">
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && goJoin()}
                placeholder="Oda kodu..."
                maxLength={6}
                className="ordex-inset h-9 border-white/10 text-sm uppercase placeholder:normal-case placeholder:text-zinc-500 focus-visible:ring-[var(--ordex-accent)]/40"
              />
              <Button
                size="sm"
                onClick={goJoin}
                disabled={!code.trim()}
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

          {/* Room lists */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--ordex-muted)]">
              Odalarım
            </p>
            {myRooms.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">Henüz oda yok.</p>
            )}
            {myRooms.map((room) =>
              room ? (
                <RoomLink
                  key={room._id}
                  code={room.code}
                  name={room.name}
                  secret={room.visibility === "secret"}
                  active={room.code === activeCode}
                  badge={unreadFor(room._id)?.count ?? 0}
                  mention={unreadFor(room._id)?.mentions ?? 0}
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
                  active={room.code === activeCode}
                  badge={unreadFor(room._id)?.count ?? 0}
                  mention={unreadFor(room._id)?.mentions ?? 0}
                />
              ))}
            {publicRooms.length === 0 && (
              <p className="px-2 py-1 text-xs text-[var(--ordex-muted)]">Keşfedilecek oda yok.</p>
            )}
          </div>
        </>
      ) : tab === "messages" ? (
        <MessagesPanel />
      ) : (
        <FriendsPanel view={friendsView} />
      )}

      {/* Profile + unified settings (Discord-style single modal) */}
      <div className="ordex-inset flex items-center gap-1 border-t border-white/5 px-2 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 pr-2 text-left transition-colors hover:bg-[var(--ordex-panel-3)]"
          title="Profil ve ayarlar"
          onClick={() => setSettingsOpen(true)}
        >
          {avatar}
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-zinc-100">
              {user?.name ?? "Misafir"}
            </span>
            <span className="block truncate text-[11px] text-[var(--ordex-muted)]">
              {user?.statusMessage || "Çevrimiçi"}
            </span>
          </span>
          <Pencil className="size-3.5 shrink-0 text-[var(--ordex-muted)]" />
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
          title="Ayarlar (profil, tema, hesap)"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
          title="Ana sayfa"
          onClick={() => navigate("/")}
        >
          <Compass className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-red-400"
          title="Çıkış"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
        </Button>
      </div>

      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  );
}

function RoomLink({
  code,
  name,
  secret,
  active,
  badge,
  mention,
}: {
  code: string;
  name: string;
  secret?: boolean;
  active: boolean;
  badge?: number;
  mention?: number;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/room/${code}`)}
      className={cn(
        "mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active
          ? "bg-[var(--ordex-panel-3)] text-white"
          : "text-zinc-200 hover:bg-[var(--ordex-panel-2)] hover:text-white",
      )}
    >
      {secret ? (
        <Lock className="size-4 shrink-0 text-[var(--ordex-muted)]" />
      ) : (
        <Hash className="size-4 shrink-0 text-[var(--ordex-muted)]" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {(mention ?? 0) > 0 && <span title="Sana @bahsetti" className="shrink-0 text-xs">@</span>}
      <CountBadge count={badge ?? 0} />
      <span className="ordex-chip shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] tracking-wider">
        {code}
      </span>
    </button>
  );
}
