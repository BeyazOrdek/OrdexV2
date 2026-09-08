import { ScreenShare } from "lucide-react";

/** Tiny pill shown next to a user's name while they broadcast their screen. */
export function SharingIndicator({ label = "Paylaşım" }: { label?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--ordex-accent)]/40 bg-[var(--ordex-accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--ordex-accent)]"
      title="Ekran yayını açık"
    >
      <ScreenShare className="size-2.5" />
      {label}
    </span>
  );
}
