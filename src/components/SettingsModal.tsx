import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
import {
  BadgeCheck,
  Check,
  ImagePlus,
  Loader2,
  LogOut,
  Palette,
  Settings as SettingsIcon,
  UserRoundCog,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { avatarHue, initials } from "@/lib/utils-room";
import {
  BADGES,
  BANNER_PRESETS,
  NAME_COLOR_PRESETS,
  readImageFile,
  STATUS_PRESETS,
} from "@/lib/profile";
import { ORDEX_THEMES, useTheme } from "@/lib/theme";

export type SettingsSection = "profile" | "appearance" | "account";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which category is selected when the modal opens (default: profile). */
  initialSection?: SettingsSection;
}

const SECTIONS: {
  id: SettingsSection;
  label: string;
  icon: typeof UserRoundCog;
}[] = [
  { id: "profile", label: "Profilim", icon: UserRoundCog },
  { id: "appearance", label: "Görünüm & Temalar", icon: Palette },
  { id: "account", label: "Hesap Ayarları", icon: SettingsIcon },
];

/**
 * Unified ÖRDEX settings window (Discord-style): left category rail,
 * right pane renders the selected section. Replaces the old separate
 * Profile and Settings dialogs.
 */
export function SettingsModal({ open, onOpenChange, initialSection = "profile" }: SettingsModalProps) {
  const { user, signOut } = useAuth();
  const [section, setSection] = useState<SettingsSection>(initialSection);
  // Radix unmounts the content when closed; re-seed the section on each open
  // via the key below so `initialSection` always wins.
  const { theme, setTheme } = useTheme();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSection(initialSection);
        onOpenChange(next);
      }}
    >
      <DialogContent
        key={open ? `open-${initialSection}` : "closed"}
        className="ordex-panel-2 flex h-[560px] max-h-[85vh] w-full max-w-3xl gap-0 overflow-hidden border-white/10 p-0"
      >
        {/* Left category rail */}
        <nav className="ordex-panel flex w-44 shrink-0 flex-col border-r border-white/5 p-2 md:w-52">
          {/* Mini profile card — clicking it jumps to the profile tab */}
          <button
            type="button"
            onClick={() => setSection("profile")}
            className={cn(
              "mb-2 flex items-center gap-2 rounded-lg p-2 text-left transition-colors",
              section === "profile" ? "bg-white/5" : "hover:bg-white/5",
            )}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name ?? "Avatar"}
                className="size-9 rounded-full border border-white/15 object-cover"
              />
            ) : (
              <span
                className="flex size-9 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: `hsl(${avatarHue(user?._id ?? "x")} 65% 45%)` }}
              >
                {initials(user?.name ?? "Misafir")}
              </span>
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-zinc-100">
                {user?.name ?? "Misafir"}
              </span>
              <span className="block truncate text-[10px] text-zinc-500">
                {user?.isAnonymous ? "Misafir hesap" : "Kayıtlı hesap"}
              </span>
            </span>
          </button>

          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors",
                section === id
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  section === id ? "text-[var(--ordex-accent)]" : "text-zinc-500",
                )}
              />
              <span className="truncate">{label}</span>
            </button>
          ))}

          <div className="flex-1" />

          <Button
            size="sm"
            variant="ghost"
            className="justify-start gap-2 px-2.5 text-xs text-zinc-400 hover:bg-red-500/10 hover:text-red-400"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> Çıkış yap
          </Button>
        </nav>

        {/* Right pane */}
        <div className="min-w-0 flex-1 overflow-y-auto p-5 [scrollbar-width:thin] md:p-6">
          {section === "profile" && (
            <>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
                <UserRoundCog className="size-5 text-[var(--ordex-accent)]" /> Profilim
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Kullanıcı adı, durum, avatar, banner, rozetler ve sohbet isim rengi. Bilgisayarından
                görsel yükleyebilir ya da link/Tenor kullanabilirsin.
              </DialogDescription>
              {/* Radix unmounts this subtree on close — fields re-seed from the
                  latest user row every open, no setState-inside-effect. */}
              {user ? (
                <ProfileForm user={user} />
              ) : (
                <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
                  <Loader2 className="size-4 animate-spin" /> Profil yükleniyor…
                </div>
              )}
            </>
          )}

          {section === "appearance" && (
            <>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
                <Palette className="size-5 text-[var(--ordex-accent)]" /> Görünüm & Temalar
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Tema anında uygulanır ve tarayıcında hatırlanır.
              </DialogDescription>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ORDEX_THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      theme === t.id
                        ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)]"
                        : "ordex-inset border-white/10 hover:bg-[var(--ordex-panel-3)]",
                    )}
                  >
                    <span className="flex shrink-0 -space-x-1.5">
                      {t.swatch.map((c) => (
                        <span
                          key={c}
                          className="size-5 rounded-full border border-white/20"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-white">{t.label}</span>
                      <span className="block truncate text-[10px] text-zinc-500">{t.desc}</span>
                    </span>
                    {theme === t.id && <Check className="size-4 shrink-0 text-[var(--ordex-accent)]" />}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-center text-[10px] text-zinc-600">
                ÖRDEX · 6 tema · data-theme motoru
              </p>
            </>
          )}

          {section === "account" && (
            <>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
                <SettingsIcon className="size-5 text-[var(--ordex-accent)]" /> Hesap Ayarları
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                Oturum bilgilerin. Misafir kimliğin tarayıcında saklanır; sayfa yenilense bile aynı
                kalır.
              </DialogDescription>
              <div className="mt-4 space-y-2">
                <InfoRow label="Kullanıcı adı" value={user?.username ?? "—"} mono />
                <InfoRow
                  label="Hesap türü"
                  value={user?.isAnonymous ? "Misafir (Guest)" : "Kayıtlı hesap"}
                />
                <InfoRow label="Görünen ad" value={user?.name ?? "Misafir"} />
                <InfoRow label="Durum" value={user?.statusMessage || "—"} />
                <InfoRow
                  label="Kullanıcı ID"
                  value={user?._id ?? "—"}
                  mono
                />
              </div>
              <div className="mt-4 rounded-lg border border-white/10 ordex-inset p-3 text-[11px] leading-relaxed text-zinc-500">
                <p className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-300">
                  <BadgeCheck className="size-3.5 text-[var(--ordex-accent)]" /> Oturum güvenliği
                </p>
                Misafir oturumların çakışmaması için kimliğin <span className="font-mono">localStorage</span>{" "}
                üzerinde tutulur ve sunucu tarafında benzersiz atanır. Kayıtlı hesaplar kullanıcı adı +
                şifre ile her cihazdan giriş yapabilir.
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ordex-inset flex items-center justify-between gap-4 rounded-lg border border-white/10 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-sm text-zinc-100",
          mono && "font-mono text-xs tracking-wide",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Structural view of the users doc used by the profile form. */
interface ProfileUser {
  name?: string | null;
  statusMessage?: string | null;
  avatarUrl?: string | null;
  bannerColor?: string | null;
  bannerUrl?: string | null;
  nameColor?: string | null;
  badges?: string[] | null;
}

function ProfileForm({ user }: { user: ProfileUser }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const searchGifs = useAction(api.tenor.searchGifs);

  const [name, setName] = useState(user.name ?? "");
  const [status, setStatus] = useState(user.statusMessage ?? "");
  const [avatar, setAvatar] = useState(user.avatarUrl ?? "");
  const [bannerColor, setBannerColor] = useState(user.bannerColor ?? "");
  const [bannerUrl, setBannerUrl] = useState(user.bannerUrl ?? "");
  const [nameColor, setNameColor] = useState(user.nameColor ?? "");
  const [badges, setBadges] = useState<string[]>(user.badges ?? []);
  const [showAvatarGifs, setShowAvatarGifs] = useState(false);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<{ id: string; preview: string; desc: string }[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const bannerFileRef = useRef<HTMLInputElement | null>(null);

  // ---- Local image upload (FileReader + canvas downscale) ----
  const pickImage = async (file: File | undefined, kind: "avatar" | "banner") => {
    if (!file) return;
    try {
      const dataUrl = await readImageFile(file, kind);
      if (kind === "avatar") setAvatar(dataUrl);
      else {
        setBannerUrl(dataUrl);
        setBannerColor("");
      }
      toast.success(kind === "avatar" ? "Avatar yüklendi — kaydetmeyi unutma." : "Banner yüklendi — kaydetmeyi unutma.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Görsel yüklenemedi.");
    }
  };

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
      toast.success("Profil kaydedildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Banner + avatar preview */}
      <div
        className="relative overflow-hidden rounded-xl border border-white/10"
        style={{
          background: bannerUrl ? undefined : bannerColor || "var(--ordex-panel-3)",
          minHeight: 72,
        }}
      >
        {bannerUrl && <img src={bannerUrl} alt="Banner" className="h-20 w-full object-cover" />}
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
              {(name.trim() || user.name || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        {nameColor && (
          <span
            className="absolute bottom-1.5 right-3 text-sm font-semibold"
            style={{ color: nameColor }}
          >
            {name.trim() || user.name || "İsim"}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Kullanıcı adı"
          maxLength={32}
          className="h-9 ordex-inset border-white/10 text-sm"
        />
        <Input
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="Durum mesajı"
          maxLength={120}
          className="h-9 ordex-inset border-white/10 text-sm"
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
                  : "ordex-inset border-white/10 text-zinc-400 hover:bg-[var(--ordex-panel-3)]",
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Avatar: local file upload + URL + Tenor GIF picker */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="Avatar linki (gif/png/jpg)"
            className="h-9 min-w-0 flex-1 ordex-inset border-white/10 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-9 shrink-0 gap-1.5 px-2 text-[11px]"
            title="Bilgisayardan resim yükle"
            onClick={() => avatarFileRef.current?.click()}
          >
            <ImagePlus className="size-3.5" /> Yükle
          </Button>
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
        {/* Hidden file inputs — FileReader ile base64'e çevrilir. */}
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pickImage(e.target.files?.[0], "avatar");
            e.target.value = "";
          }}
        />
        {showAvatarGifs && (
          <div className="rounded-lg border border-white/10 ordex-inset p-2">
            <div className="flex gap-2">
              <Input
                value={gifQuery}
                onChange={(e) => setGifQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadGifs(gifQuery)}
                placeholder="GIF ara..."
                className="h-8 flex-1 border-white/10 bg-[var(--ordex-panel-2)] text-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-2 text-xs"
                onClick={() => void loadGifs(gifQuery)}
              >
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

      {/* Banner: presets + local upload + URL */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Profil bannerı
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5 text-[10px] text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            onClick={() => bannerFileRef.current?.click()}
          >
            <ImagePlus className="size-3" /> Resim yükle
          </Button>
        </div>
        <input
          ref={bannerFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void pickImage(e.target.files?.[0], "banner");
            e.target.value = "";
          }}
        />
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
          value={bannerUrl.startsWith("data:") ? "" : bannerUrl}
          onChange={(e) => {
            setBannerUrl(e.target.value);
            if (e.target.value) setBannerColor("");
          }}
          placeholder={bannerUrl.startsWith("data:") ? "Yerel dosya yüklendi ✓" : "Banner görsel linki (https://...)"}
          className="h-9 ordex-inset border-white/10 text-xs"
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Sohbet isim rengi
        </p>
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
    </div>
  );
}
