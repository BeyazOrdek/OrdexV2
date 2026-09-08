import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Loader2, UserRoundCog } from "lucide-react";
import { useEffect, useState } from "react";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user } = useAuth();
  const updateProfile = useMutation(api.users.updateProfile);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [avatar, setAvatar] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name ?? "");
      setStatus(user.statusMessage ?? "");
      setAvatar(user.avatarUrl ?? "");
    }
  }, [open, user]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        statusMessage: status,
        avatarUrl: avatar.trim(),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ordex-panel-2 max-w-sm border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <UserRoundCog className="size-4 text-[var(--ordex-accent)]" /> Profil
          </DialogTitle>
          <DialogDescription>
            Kullanıcı adı, durum mesajı ve avatar. Avatar için bir resim veya Tenor GIF linki yapıştırabilirsin.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          {avatar.trim() ? (
            <img
              src={avatar}
              alt="Avatar önizleme"
              className="size-14 shrink-0 rounded-full border border-white/15 object-cover"
            />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--ordex-accent-soft)] text-sm font-bold text-[var(--ordex-accent)]">
              {(name.trim() || user?.name || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Kullanıcı adı"
              maxLength={32}
              className="h-9 border-white/10 bg-black/30 text-sm"
            />
            <Input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Durum mesajı (örn. film modunda)"
              maxLength={120}
              className="h-9 border-white/10 bg-black/30 text-sm"
            />
          </div>
        </div>

        <Input
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="Avatar linki (https://... gif/jpg/png)"
          className="h-9 border-white/10 bg-black/30 text-xs"
        />

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        <Button
          onClick={() => void save()}
          disabled={saving}
          className="w-full gap-2 bg-[var(--ordex-accent)] text-white hover:bg-[var(--ordex-accent-hover)]"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : null} Kaydet
        </Button>
      </DialogContent>
    </Dialog>
  );
}
