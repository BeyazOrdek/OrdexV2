import { useAuth } from "@/hooks/use-auth";
import { Mic, MicOff, Pencil, Settings, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCallControls,
  ProfileAvatar,
  useCallState,
} from "@/components/social/SocialOverlay";
import { toast } from "sonner";

/**
 * Discord-style bottom-left profile bar: avatar + name + status dot, quick
 * mic / headphone toggles and the settings gear. While a 1:1 call is live the
 * bar shows a green "Ses Bağlantısı Kuruldu / Aramada" line, exactly like
 * Discord's voice status footer.
 */
export function ProfileBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user } = useAuth();
  const call = useCallState();
  const controls = getCallControls();
  const inCall = call.active && !call.ringing;
  const onCall = call.active;

  return (
    <div className="ordex-inset flex items-center gap-1 border-t border-white/5 px-2 py-2">
      <ProfileAvatar
        user={{
          _id: user?._id ?? "",
          name: user?.name ?? "Misafir",
          avatarUrl: user?.avatarUrl ?? undefined,
          statusMessage: user?.statusMessage,
        }}
        size={8}
      />
      <span className="relative -ml-2 mr-0.5 shrink-0">
        {/* Presence dot: green = online */}
        <span className="block size-3 rounded-full border-2 border-[var(--ordex-panel-2)] bg-emerald-500" />
      </span>

      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-0.5 pr-1 text-left transition-colors hover:bg-[var(--ordex-panel-3)]"
        title="Profil ve ayarlar"
        onClick={onOpenSettings}
      >
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium text-zinc-100">
            {user?.name ?? "Misafir"}
          </span>
          <span className="block truncate text-[11px] leading-tight">
            {inCall ? (
              <span className="font-medium text-emerald-400">Ses Bağlantısı Kuruldu</span>
            ) : onCall ? (
              <span className="font-medium text-emerald-400">Aramada — {call.peerName}</span>
            ) : (
              <span className="text-[var(--ordex-muted)]">
                {user?.statusMessage || "Çevrimiçi"}
              </span>
            )}
          </span>
        </span>
        <Pencil className="size-3.5 shrink-0 text-[var(--ordex-muted)]" />
      </button>

      {/* Quick mic toggle (live during calls) */}
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
        title={call.micOn ? "Mikrofonu kapat" : "Mikrofonu aç"}
        onClick={() => {
          if (controls) controls.toggleMic();
          else toast.info("Mikrofon kontrolü yalnızca arama sırasında kullanılabilir.");
        }}
      >
        {call.micOn ? <Mic className="size-4" /> : <MicOff className="size-4 text-red-400" />}
      </Button>

      {/* Quick headphone (deafen) toggle */}
      <Button
        size="icon"
        variant={call.deafened ? "destructive" : "ghost"}
        className="size-8 shrink-0 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
        title={call.deafened ? "Kulaklığı aç" : "Kulaklığı kapat"}
        onClick={() => {
          if (controls) controls.toggleDeafen();
          else toast.info("Kulaklık kontrolü yalnızca arama sırasında kullanılabilir.");
        }}
      >
        {call.deafened ? <VolumeX className="size-4 text-red-400" /> : <Volume2 className="size-4" />}
      </Button>

      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-[var(--ordex-muted)] hover:bg-white/10 hover:text-zinc-100"
        title="Ayarlar (profil, tema, hesap)"
        onClick={onOpenSettings}
      >
        <Settings className="size-4" />
      </Button>
    </div>
  );
}
