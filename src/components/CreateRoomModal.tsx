import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Clapperboard, Gamepad2, Globe2, Loader2, Lock } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

interface CreateRoomModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateRoomModal({ open, onOpenChange }: CreateRoomModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const createRoom = useMutation(api.rooms.createRoom);
  const [roomName, setRoomName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "secret">("public");
  const [roomType, setRoomType] = useState<"cinema" | "gaming">("cinema");
  const [creating, setCreating] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await createRoom({
        name: roomName.trim() || `${user?.name ?? "Misafir"}'in odası`,
        visibility,
        roomType,
      });
      setCreatedCode(result.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Oda oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setRoomName("");
      setVisibility("public");
      setRoomType("cinema");
      setCreatedCode(null);
      setError(null);
    }
  };

  const copyLink = () => {
    if (!createdCode) return;
    void navigator.clipboard
      .writeText(`${window.location.origin}/room/${createdCode}`)
      .catch(() => undefined);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="ordex-panel-2 max-w-sm border-white/10">
        {createdCode ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-white">Oda hazır 🎉</DialogTitle>
              <DialogDescription>
                {visibility === "secret"
                  ? "Gizli oda: sadece bu kod veya link ile katılınabilir, açık oda listelerinde görünmez."
                  : "Oda herkese açık listelerde de görünecek."}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-center rounded-lg border border-white/10 bg-black/40 py-4">
              <span className="font-mono text-2xl font-bold tracking-[0.35em] text-white">
                {createdCode}
              </span>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="border-white/10 bg-black/20 text-xs hover:bg-white/5" onClick={copyLink}>
                Linki kopyala
              </Button>
              <Button
                className="bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
                onClick={() => navigate(`/room/${createdCode}`)}
              >
                Odaya gir
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-white">Yeni oda oluştur</DialogTitle>
              <DialogDescription>Oda adı ver ve gizlilik seç.</DialogDescription>
            </DialogHeader>
            <Input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !creating && void create()}
              placeholder="Oda adı (örn. Film Gecesi)"
              maxLength={60}
              className="h-10 border-white/10 bg-black/30 text-sm placeholder:text-zinc-600"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  visibility === "public"
                    ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)]"
                    : "border-white/10 bg-black/20 hover:bg-white/5",
                )}
              >
                <Globe2 className="size-4 text-[var(--ordex-accent)]" />
                <span className="text-xs font-semibold text-white">Herkese açık</span>
                <span className="text-[10px] leading-snug text-zinc-500">
                  Keşfet listelerinde herkese görünür
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("secret")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  visibility === "secret"
                    ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)]"
                    : "border-white/10 bg-black/20 hover:bg-white/5",
                )}
              >
                <Lock className="size-4 text-[var(--ordex-accent)]" />
                <span className="text-xs font-semibold text-white">Gizli / davet kodlu</span>
                <span className="text-[10px] leading-snug text-zinc-500">
                  Sadece kod veya link ile girilir
                </span>
              </button>
            </div>
            {/* Room type: cinema (synced watch-together) or gaming (screen share) */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRoomType("cinema")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  roomType === "cinema"
                    ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)]"
                    : "border-white/10 bg-black/20 hover:bg-white/5",
                )}
              >
                <Clapperboard className="size-4 text-[var(--ordex-accent)]" />
                <span className="text-xs font-semibold text-white">🎬 Sinema & Medya</span>
                <span className="text-[10px] leading-snug text-zinc-500">
                  Senkron YouTube/MP4 izleme, sıra, sesli + yazılı sohbet
                </span>
              </button>
              <button
                type="button"
                onClick={() => setRoomType("gaming")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                  roomType === "gaming"
                    ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)]"
                    : "border-white/10 bg-black/20 hover:bg-white/5",
                )}
              >
                <Gamepad2 className="size-4 text-[var(--ordex-accent)]" />
                <span className="text-xs font-semibold text-white">🎮 Gaming & Ekran</span>
                <span className="text-[10px] leading-snug text-zinc-500">
                  Tek tıkla ekran/oyun yayını, herkes tam ekran izler
                </span>
              </button>
            </div>
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <DialogFooter>
              <Button
                onClick={() => void create()}
                disabled={creating}
                className="w-full gap-2 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
              >
                {creating ? <Loader2 className="size-4 animate-spin" /> : null} Odayı kur
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
