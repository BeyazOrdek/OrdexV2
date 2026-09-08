import { cn } from "@/lib/utils";
import { MessageSquare, MonitorPlay, Users, Headphones } from "lucide-react";

export type MobileTab = "stage" | "chat" | "voice" | "friends";

const TABS: { id: MobileTab; label: string; icon: typeof MonitorPlay }[] = [
  { id: "stage", label: "Yayın", icon: MonitorPlay },
  { id: "chat", label: "Sohbet", icon: MessageSquare },
  { id: "voice", label: "Ses", icon: Headphones },
  { id: "friends", label: "Arkadaş", icon: Users },
];

interface MobileNavProps {
  tab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  voiceCount: number;
}

/** Fixed touch-friendly bottom navigation (mobile only, <= 768px). */
export function MobileNav({ tab, onTabChange, voiceCount }: MobileNavProps) {
  return (
    <nav className="ordex-panel fixed inset-x-0 bottom-0 z-40 grid h-16 grid-cols-4 border-t border-white/10 pb-[env(safe-area-inset-bottom)] md:hidden">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={cn(
            "relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
            tab === id ? "text-[var(--ordex-accent)]" : "text-zinc-500 active:text-zinc-300",
          )}
        >
          <Icon className="size-5" />
          {label}
          {tab === id && (
            <span className="absolute top-0 h-0.5 w-8 rounded-full bg-[var(--ordex-accent)]" />
          )}
          {id === "voice" && voiceCount > 0 && (
            <span className="absolute right-[22%] top-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--ordex-accent)] text-[8px] font-bold text-white">
              {voiceCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
