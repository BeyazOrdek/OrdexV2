import { X } from "lucide-react";
import { useCallback, useEffect } from "react";

/**
 * Full-screen lightbox for shared chat media. Closes on backdrop click,
 * ESC, or the ✕ button. Rendered via createPortal by the callers' shadcn
 * Dialog is overkill here — a fixed overlay is enough and keeps DOM churn
 * (insertBefore crash-safety) minimal.
 */
export function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey, true);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      document.body.style.overflow = prev;
    };
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? "Görsel görüntüleyici"}
    >
      <button
        type="button"
        className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        title="Kapat (ESC)"
        onClick={onClose}
      >
        <X className="size-5" />
      </button>
      <img
        src={src}
        alt={alt ?? "Görsel"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full cursor-default rounded-lg object-contain shadow-2xl"
        draggable={false}
      />
    </div>
  );
}
