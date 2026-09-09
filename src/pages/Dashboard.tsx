import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { avatarHue, initials } from "@/lib/utils-room";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Clapperboard,
  Globe2,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { CreateRoomModal } from "@/components/CreateRoomModal";
import { SettingsModal } from "@/components/SettingsModal";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const myRooms = useQuery(api.rooms.listMyRooms, {}) ?? [];
  const publicRooms = useQuery(api.rooms.listPublicRooms, {}) ?? [];

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const goJoin = () => {
    const clean = code.trim().toUpperCase();
    if (clean.length === 6) navigate(`/room/${clean}`);
  };

  return (
    <main className="ordex-bg min-h-screen">
      {/* Top bar */}
      <header className="ordex-panel border-b border-white/5">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-[var(--ordex-accent)] text-white">
              <Clapperboard className="size-4" />
            </span>
            <span className="text-sm font-black tracking-widest text-white">ÖRDEX</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-white/5"
              title="Profil ve ayarlar"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? "Avatar"}
                  className="size-8 rounded-full border border-white/15 object-cover"
                />
              ) : (
                <span
                  className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: `hsl(${avatarHue(user?._id ?? "x")} 65% 45%)` }}
                >
                  {initials(user?.name ?? "Misafir")}
                </span>
              )}
              <span className="hidden text-sm text-zinc-300 sm:block">
                {user?.name ?? "Misafir"}
              </span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              title="Ayarlar (profil, tema, hesap)"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-zinc-400 hover:bg-white/10 hover:text-red-400"
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
        <p className="mt-1 text-sm text-[var(--ordex-muted)]">
          Oda kur, kodla davet et, sesli kanala bağlan — video herkes için senkron akar.
        </p>

        {/* Create + join */}
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="ordex-panel-2 rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ArrowRight className="size-4 text-[var(--ordex-accent)]" /> Oda kur
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Herkese açık ya da gizli (davet kodlu) oda oluştur.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              className="mt-3 h-10 w-full gap-2 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
            >
              Oda oluştur
            </Button>
          </div>

          <div className="ordex-panel-2 rounded-xl border border-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Users className="size-4 text-[var(--ordex-accent)]" /> Kodla katıl
            </div>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && goJoin()}
              placeholder="6 haneli oda kodu"
              maxLength={6}
              className="mt-3 h-10 border-white/10 bg-black/30 font-mono text-sm uppercase tracking-[0.3em] placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-600 focus-visible:ring-[var(--ordex-accent)]/40"
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
                      className="ordex-panel-2 group rounded-xl border border-white/5 p-4 text-left transition-colors hover:border-[var(--ordex-accent)]/40 hover:bg-[var(--ordex-panel-3)]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 items-center justify-center rounded-md bg-[var(--ordex-accent-soft)] text-[var(--ordex-accent)]">
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
                        <span className="text-xs text-zinc-500 transition-colors group-hover:text-[var(--ordex-accent)]">
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
                  className="ordex-panel-2 group rounded-xl border border-white/5 p-4 text-left transition-colors hover:border-[var(--ordex-accent)]/40 hover:bg-[var(--ordex-panel-3)]"
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
                    <span className="text-xs text-zinc-500 transition-colors group-hover:text-[var(--ordex-accent)]">
                      Katıl →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <CreateRoomModal open={createOpen} onOpenChange={setCreateOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </main>
  );
}
