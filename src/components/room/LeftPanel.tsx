import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { useMutation, useQuery } from "convex/react";
import { Compass, Hash, LogOut, Plus, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LeftPanel({ activeCode }: { activeCode?: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");

  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];
  const createRoom = useMutation(api.rooms.createRoom);
  const joinRoom = useMutation(api.rooms.joinRoom);

  const goCreate = async () => {
    try {
      const result = await createRoom({ name: `${user?.name ?? "Misafir"}'in odası` });
      navigate(`/room/${result.code}`);
    } catch (err) {
      console.error(err);
    }
  };

  const goJoin = () => {
    const clean = code.trim().toUpperCase();
    if (clean) navigate(`/room/${clean}`);
  };

  return (
    <aside className="flex h-full w-full flex-col bg-[#131518] text-zinc-200">
      {/* Search / quick join */}
      <div className="border-b border-white/5 p-3">
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && goJoin()}
            placeholder="Oda kodu..."
            maxLength={6}
            className="h-9 border-white/10 bg-black/30 text-sm uppercase placeholder:normal-case focus-visible:ring-red-500/40"
          />
          <Button
            size="sm"
            onClick={goJoin}
            disabled={!code.trim()}
            className="h-9 shrink-0 bg-red-600 px-3 text-white hover:bg-red-500"
          >
            Katıl
          </Button>
        </div>
        <Button
          onClick={goCreate}
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
            <RoomLink key={room._id} code={room.code} name={room.name} active={room.code === activeCode} />
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

      {/* Profile */}
      <div className="flex items-center gap-2 border-t border-white/5 bg-black/30 p-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: `hsl(${avatarHue(user?._id ?? "x")} 65% 45%)` }}
        >
          {initials(user?.name ?? "Misafir")}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-zinc-100">{user?.name ?? "Misafir"}</p>
          <p className="truncate text-[11px] text-zinc-500">Çevrimiçi</p>
        </div>
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
          className="size-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
          title="Oda merkezi"
          onClick={() => navigate("/dashboard")}
        >
          <Users className="size-4" />
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
    </aside>
  );
}

function RoomLink({ code, name, active }: { code: string; name: string; active: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(`/room/${code}`)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
        active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
      )}
    >
      <Hash className="size-4 shrink-0 text-zinc-500" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-zinc-500">
        {code}
      </span>
    </button>
  );
}
