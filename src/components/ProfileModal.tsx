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
import { useMutation, useAction } from "convex/react";
import { Check, Loader2, UserRoundCog, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BADGES, BANNER_PRESETS, NAME_COLOR_PRESETS, STATUS_PRESETS } from "@/lib/profile";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user } = useAuth();
  const updateProfile = useMutation(api.users.updateProfile);
  const searchGifs = useAction(api.tenor.searchGifs);

  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bannerColor, setBannerColor] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [nameColor, setNameColor] = useState("");
  const [badges, setBadges] = useState<string[]>([]);
  const [showAvatarGifs, setShowAvatarGifs] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<{ id: string; preview: string; desc: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setName(user.name ?? "");
      setStatus(user.statusMessage ?? "");
      setAvatar(user.avatarUrl ?? "");
      setBannerColor(user.bannerColor ?? "");
      setBannerUrl(user.bannerUrl ?? "");
      setNameColor(user.nameColor ?? "");
      setBadges(user.badges ?? []);
    }
  }, [open, user]);

  const loadGifs = async (q: string) => {
    setGifLoading(true);
    try {
      const result = await searchGifs({ query: q });
      setGifs(result.gifs.map((g) => ({ id: g.id, preview: g.preview, desc: g.desc })));
      if (result.error) toast.error(result.error);
    } catch {
      toast.error("GIF'ler yüklenemedi.");
    } finally {
      setGifLoading(false);
    }
  };

  const toggleBadge = (id: string) => {
    setBadges((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        name: name.trim() || undefined,
        statusMessage: status,
        avatarUrl: avatar.trim(),
        bannerColor: bannerColor.trim(),
        bannerUrl: bannerUrl.trim(),
        nameColor: nameColor.trim(),
        badges,
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
      <DialogContent className="ordex-panel-2 max-h-[90vh] max-w-md overflow-y-auto border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <UserRoundCog className="size-4 text-[var(--ordex-accent)]" /> Profil
          </DialogTitle>
          <DialogDescription>
            Kullanıcı adı, durum, avatar, banner, rozetler ve sohbet isim rengi.
          </DialogDescription>
        </DialogHeader>

        {/* Banner + avatar preview */}
        <div
          className="relative overflow-hidden rounded-xl border border-white/10"
          style={{ background: bannerUrl ? undefined : bannerColor || "var(--ordex-panel-3)", minHeight: 72 }}
        >
          {bannerUrl && (
            <img src={bannerUrl} alt="Banner" className="h-20 w-full object-cover" />
          )}
          <div className="absolute -bottom-5 left-3">
            {avatar.trim() ? (
              <img
                src={avatar}
                alt="Avatar"
                className="size-12 rounded-full border-2 border-white/20 object-cover"
              />
            ) : (
              <span
                className="flex size-12 items-center justify-center rounded-full border-2 border-white/20 bg-[var(--ordex-accent-soft)] text-sm font-bold text-[var(--ordex-accent)]"
                style={{ color: nameColor || undefined }}
              >
                {(name.trim() || user?.name || "?").slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          {nameColor && (
            <span
              className="absolute bottom-1.5 right-3 text-sm font-semibold"
              style={{ color: nameColor }}
            >
              {name.trim() || user?.name || "İsim"}
            </span>
          )}
        </div>

        <div className="space-y-2 pt-2">
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
            placeholder="Durum mesajı"
            maxLength={120}
            className="h-9 border-white/10 bg-black/30 text-sm"
          />
          {/* Status presets */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setStatus(preset)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  status === preset
                    ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)] text-white"
                    : "border-white/10 bg-black/20 text-zinc-400 hover:bg-white/5",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Avatar URL + Tenor GIF picker */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="Avatar linki (gif/png/jpg)"
              className="h-9 flex-1 border-white/10 bg-black/30 text-xs"
            />
            <Button
              size="sm"
              variant="secondary"
              className="h-9 shrink-0 px-2 text-[11px]"
              onClick={() => {
                setShowAvatarGifs((v) => !v);
                if (!showAvatarGifs && gifs.length === 0 && !gifLoading) void loadGifs("");
              }}
            >
              Tenor
            </Button>
          </div>
          {showAvatarGifs && (
            <div className="rounded-lg border border-white/10 bg-black/30 p-2">
              <div className="flex gap-2">
                <Input
                  value={gifQuery}
                  onChange={(e) => setGifQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void loadGifs(gifQuery)}
                  placeholder="GIF ara..."
                  className="h-8 flex-1 border-white/10 bg-black/40 text-xs"
                />
                <Button size="sm" variant="secondary" className="h-8 px-2 text-xs" onClick={() => void loadGifs(gifQuery)}>
                  Ara
                </Button>
              </div>
              <div className="mt-2 grid max-h-28 grid-cols-4 gap-1.5 overflow-y-auto [scrollbar-width:thin]">
                {gifLoading && (
                  <div className="col-span-4 flex justify-center py-2">
                    <Loader2 className="size-4 animate-spin text-zinc-500" />
                  </div>
                )}
                {gifs.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setAvatar(g.preview);
                      setShowAvatarGifs(false);
                    }}
                    className="overflow-hidden rounded border border-transparent hover:border-[var(--ordex-accent)]"
                  >
                    <img src={g.preview} alt={g.desc} className="h-12 w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Banner */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Profil bannerı</p>
          <div className="flex flex-wrap gap-1.5">
            {BANNER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setBannerColor(preset);
                  setBannerUrl("");
                }}
                className={cn(
                  "size-7 rounded-md border transition-transform hover:scale-105",
                  bannerColor === preset && !bannerUrl ? "border-white ring-2 ring-white/40" : "border-white/20",
                )}
                style={{ background: preset }}
              />
            ))}
            {bannerColor && !bannerUrl && (
              <button
                type="button"
                onClick={() => setBannerColor("")}
                className="flex size-7 items-center justify-center rounded-md border border-white/20 text-zinc-500 hover:text-zinc-200"
                title="Bannerı temizle"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          <Input
            value={bannerUrl}
            onChange={(e) => {
              setBannerUrl(e.target.value);
              if (e.target.value) setBannerColor("");
            }}
            placeholder="Banner görsel linki (https://...)"
            className="h-9 border-white/10 bg-black/30 text-xs"
          />
        </div>

        {/* Badges */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Rozetler</p>
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((badge) => {
              const active = badges.includes(badge.id);
              return (
                <button
                  key={badge.id}
                  type="button"
                  onClick={() => toggleBadge(badge.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    badge.className,
                    active ? "opacity-100 ring-1 ring-white/40" : "opacity-45 hover:opacity-75",
                  )}
                  title={active ? "Rozeti kaldır" : "Rozet ekle"}
                >
                  <span>{badge.icon}</span>
                  {badge.label}
                  {active && <Check className="size-2.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Name color */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sohbet isim rengi</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {NAME_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setNameColor(preset === nameColor ? "" : preset)}
                className={cn(
                  "size-6 rounded-full border transition-transform hover:scale-105",
                  nameColor === preset ? "border-white ring-2 ring-white/40" : "border-white/20",
                )}
                style={{ background: preset }}
              />
            ))}
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(nameColor) ? nameColor : "#e7e8ea"}
              onChange={(e) => setNameColor(e.target.value)}
              className="size-6 cursor-pointer rounded-md border border-white/20 bg-transparent"
              title="Özel renk seç"
            />
            {nameColor && (
              <button
                type="button"
                onClick={() => setNameColor("")}
                className="flex size-6 items-center justify-center rounded-full border border-white/20 text-zinc-500 hover:text-zinc-200"
                title="Rengi temizle"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </div>

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
