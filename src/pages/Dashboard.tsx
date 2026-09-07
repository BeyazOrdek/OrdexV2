import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  Clapperboard,
  Globe2,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [creating, setCreating] = useState(false);

  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];
  const createRoom = useMutation(api.rooms.createRoom);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const goCreate = async () => {
    setCreating(true);
    try {
      const result = await createRoom({
        name: roomName.trim() || `${user?.name ?? "Misafir"}'in odası`,
      });
      navigate(`/room/${result.code}`);
    } catch (err) {
      console.error(err);
      setCreating(false);
    }
  };

  const goJoin = () => {
    const clean = code.trim().toUpperCase();
    if (clean.length === 6) navigate(`/room/${clean}`);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border/60 bg-[#131518]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-red-600 text-white">
              <Clapperboard className="size-4" />
            </span>
            <span className="text-sm font-bold tracking-tight text-white">
              Senkron
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: `hsl(${avatarHue(user?._id ?? "x")} 65% 45%)` }}
            >
              {initials(user?.name ?? "Misafir")}
            </span>
            <span className="hidden text-sm text-zinc-300 sm:block">
              {user?.name ?? "Misafir"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              title="Çıkış"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Birlikte izle, birlikte konuş.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oda kur, kodla davet et, sesli kanala bağlan — video herkes için senkron akar.
        </p>

        {/* Create + join */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border/60 bg-[#1a1d21] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Plus className="size-4 text-red-500" /> Yeni oda oluştur
            </div>
            <Input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !creating && void goCreate()}
              placeholder="Oda adı (örn. Film Gecesi)"
              maxLength={60}
              className="mt-3 h-10 border-white/10 bg-black/30 text-sm placeholder:text-zinc-600 focus-visible:ring-red-500/40"
            />
            <Button
              onClick={() => void goCreate()}
              disabled={creating}
              className="mt-3 h-10 w-full gap-2 bg-red-600 text-white hover:bg-red-500"
            >
              Odayı kur <ArrowRight className="size-4" />
            </Button>
          </div>

          <div className="rounded-xl border border-border/60 bg-[#1a1d21] p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Users className="size-4 text-red-500" /> Kodla katıl
            </div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && goJoin()}
              placeholder="6 haneli oda kodu"
              maxLength={6}
              className="mt-3 h-10 border-white/10 bg-black/30 font-mono text-sm uppercase tracking-[0.3em] placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-600 focus-visible:ring-red-500/40"
            />
            <Button
              onClick={goJoin}
              disabled={code.trim().length !== 6}
              variant="outline"
              className="mt-3 h-10 w-full gap-2 border-white/10 bg-black/20 text-sm hover:bg-white/5"
            >
              Odaya gir <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* My rooms */}
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
                    <button
                      key={room._id}
                      onClick={() => navigate(`/room/${room.code}`)}
                      className="group rounded-xl border border-border/60 bg-[#1a1d21] p-4 text-left transition-colors hover:border-red-500/40 hover:bg-[#1f2227]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-md bg-red-600/15 text-red-400">
                          <Clapperboard className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
                          {room.name}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] tracking-widest text-zinc-400">
                          {room.code}
                        </span>
                        <span className="text-xs text-zinc-500 transition-colors group-hover:text-red-400">
                          Katıl →
                        </span>
                      </div>
                    </button>
                  ),
              )}
            </div>
          )}
        </section>

        {/* Public rooms */}
        <section className="mt-8 pb-10">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Globe2 className="size-3.5" /> Herkese açık odalar
          </h2>
          {publicRooms.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">Keşfedilecek oda yok.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {publicRooms.slice(0, 12).map((room) => (
                <button
                  key={room._id}
                  onClick={() => navigate(`/room/${room.code}`)}
                  className="group rounded-xl border border-border/60 bg-[#1a1d21] p-4 text-left transition-colors hover:border-red-500/40 hover:bg-[#1f2227]"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md bg-white/5 text-zinc-300">
                      <Globe2 className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
                      {room.name}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[11px] tracking-widest text-zinc-400">
                      {room.code}
                    </span>
                    <span className="text-xs text-zinc-500 transition-colors group-hover:text-red-400">
                      Katıl →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
