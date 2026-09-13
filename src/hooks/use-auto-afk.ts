import { api } from "@/convex/_generated/api";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";

// ---------- 😴 Auto-AFK presence (5 min idle → Boşta 🌙) ----------

const IDLE_MS = 5 * 60_000;

const ACTIVITY_EVENTS: (keyof DocumentEventMap)[] = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
];

/**
 * Watches real user activity and flips the server-side presence status:
 * - idle for 5 minutes  → presenceStatus: "afk"     (Boşta 🌙)
 * - any input/focus     → presenceStatus: "online"  (Çevrimiçi 🟢)
 *
 * Writes only on actual transitions (never per heartbeat), so Convex write
 * volume stays negligible. Mounted once from main.tsx; the returned `afk`
 * state lets the local UI (ProfileBar) mirror the status instantly.
 */
export function useAutoAfk() {
  const { isAuthenticated } = useConvexAuth();
  const setPresenceStatus = useMutation(api.users.setPresenceStatus);
  const [afk, setAfk] = useState(false);
  // Refs mirror live values inside the activity handler (stable listener).
  const lastActivityRef = useRef(Date.now());
  const afkRef = useRef(false);
  const authRef = useRef(isAuthenticated);
  const mutationRef = useRef(setPresenceStatus);

  useEffect(() => {
    authRef.current = isAuthenticated;
  }, [isAuthenticated]);
  useEffect(() => {
    mutationRef.current = setPresenceStatus;
  }, [setPresenceStatus]);

  useEffect(() => {
    let checkInterval: number | undefined;

    const push = (next: boolean) => {
      if (afkRef.current === next) return;
      afkRef.current = next;
      setAfk(next);
      if (authRef.current) {
        void mutationRef.current({ status: next ? "afk" : "online" }).catch(() => undefined);
      }
    };

    const onActivity = () => {
      lastActivityRef.current = Date.now();
      push(false);
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    // Tab becoming visible/focused counts as activity too.
    window.addEventListener("focus", onActivity);

    checkInterval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= IDLE_MS) push(true);
    }, 15_000);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.removeEventListener("focus", onActivity);
      if (checkInterval !== undefined) window.clearInterval(checkInterval);
    };
  }, []);

  return { afk };
}
