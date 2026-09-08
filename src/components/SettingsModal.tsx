import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { ORDEX_THEMES, type ThemeId } from "@/lib/theme";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemeId;
  onThemeChange: (id: ThemeId) => void;
}

export function SettingsModal({ open, onOpenChange, theme, onThemeChange }: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ordex-panel-2 max-w-md border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Palette className="size-4 text-[var(--ordex-accent)]" /> Ayarlar
          </DialogTitle>
          <DialogDescription>Tema seçimi — anında uygulanır ve hatırlanır.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {ORDEX_THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => onThemeChange(t.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                theme === t.id
                  ? "border-[var(--ordex-accent)] bg-[var(--ordex-accent-soft)]"
                  : "border-white/10 bg-black/20 hover:bg-white/5",
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
        <p className="text-center text-[10px] text-zinc-600">ÖRDEX · 6 tema · data-theme motoru</p>
      </DialogContent>
    </Dialog>
  );
}
