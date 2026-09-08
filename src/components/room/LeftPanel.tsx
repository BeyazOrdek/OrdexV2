import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import {
  Compass,
  Hash,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { ProfileModal } from "@/components/ProfileModal";
import { SettingsModal } from "@/components/SettingsModal";
import { FriendsPanel } from "@/components/social/FriendsPanel";
import type { ThemeId } from "@/lib/theme";
import { useTheme } from "@/lib/theme";

type Tab = "rooms" | "friends";

export function LeftPanel({ activeCode }: { activeCode?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("rooms");
  const [code, setCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];
  const joinRoom = useMutation(api.rooms.joinRoom);

  const goJoin = () => {
    const clean = code.trim().toUpperCase();
    if (!clean) return;
    void joinRoom({ code: clean })
      .then(() => navigate(`/room/${clean}`))
      .catch(() => navigate(`/room/${clean}`)); // joinRoom is idempotent; navigate regardless
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

  return (
    <aside className="ordex-panel flex h-full w-full flex-col text-zinc-200">
      {/* Tabs */}
      <div className="grid grid-cols-2 border-b border-white/5 p-1">
        <button
          onClick={() => setTab("rooms")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
            tab === "rooms" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          <Hash className="size-3.5" /> Odalar
        </button>
        <button
          onClick={() => setTab("friends")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
            tab === "friends" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          <Users className="size-3.5" /> Arkadaşlar
        </button>
      </div>

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
                className="h-9 border-white/10 bg-black/30 text-sm uppercase placeholder:normal-case focus-visible:ring-[var(--ordex-accent)]/40"
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
              className="mt-2 w-full justify-start gap-2 border-white/10 bg-black/20 text-sm hover:bg-white/5"
            >
              <Plus className="size-4" /> Oda oluştur
            </Button>
          </div>

          {/* Room lists */}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:thin]">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Odalarım
            </p>
            {myRooms.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-600">Henüz oda yok.</p>
            )}
            {myRooms.map((room) =>
              room ? (
                <RoomLink
                  key={room._id}
                  code={room.code}
                  name={room.name}
                  secret={room.visibility === "secret"}
                  active={room.code === activeCode}
                />
              ) : null,
            )}

            <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Herkese açık odalar
            </p>
            {publicRooms
              .filter((r) => !myRooms.some((m) => m?._id === r._id))
              .slice(0, 12)
              .map((room) => (
                <RoomLink key={room._id} code={room.code} name={room.name} active={room.code === activeCode} />
              ))}
            {publicRooms.length === 0 && (
              <p className="px-2 py-1 text-xs text-zinc-600">Keşfedilecek oda yok.</p>
            )}
          </div>
        </>
      ) : (
        <FriendsPanel />
      )}

      {/* Profile */}
      <div className="flex items-center gap-2 border-t border-white/5 bg-black/30 p-3">
        {avatar}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-zinc-100">{user?.name ?? "Misafir"}</p>
          <p className="truncate text-[11px] text-zinc-500">
            {user?.statusMessage || "Çevrimiçi"}
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Profili düzenle"
          onClick={() => setProfileOpen(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Ayarlar ve tema"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Ana sayfa"
          onClick={() => navigate("/")}
        >
          <Compass className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-zinc-400 hover:bg-white/10 hover:text-red-400"
          title="Çıkış"
          onClick={() => void signOut()}
        >
          <LogOut className="size-4" />
        </Button>
      </div>

      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
      <ProfileModal open={profileOpen} onOpenChange={setProfileOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} theme={theme} onThemeChange={setTheme} />
    </aside>
  );
}

function RoomLink({
  code,
  name,
  secret,
  active,
}: {
  code: string;
  name: string;
  secret?: boolean;
  active: boolean;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/room/${code}`)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      {secret ? (
        <Lock className="size-4 shrink-0 text-zinc-500" />
      ) : (
        <Hash className="size-4 shrink-0 text-zinc-500" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-zinc-500">
        {code}
      </span>
    </button>
  );
}
