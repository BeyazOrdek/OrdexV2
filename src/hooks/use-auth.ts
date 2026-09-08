import { api } from "@/convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { useEffect, useMemo } from "react";
import { ensureGuestUsername } from "@/lib/utils-room";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.currentUser);
  const { signIn, signOut } = useAuthActions();
  const ensureUsername = useMutation(api.users.ensureUsername);

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  // Guests: reserve a unique Guest_#### handle locally on first load, then
  // claim it (or adopt whatever unique handle the server assigned) on the
  // account. Persisted in localStorage so refreshes and reconnects keep one
  // stable temporary identity — no session collisions.
  const guestUsername = useMemo(
    () => (user?.isAnonymous ? ensureGuestUsername() : null),
    [user?.isAnonymous],
  );
  const needsUsername = Boolean(user && !user.username);
  useEffect(() => {
    if (!needsUsername) return;
    void ensureUsername({ preferred: guestUsername ?? undefined })
      .then(({ username }) => {
        if (guestUsername && username !== guestUsername) {
          localStorage.setItem("senkron:guestUsername", username);
        }
      })
      .catch(() => undefined);
  }, [needsUsername, guestUsername, ensureUsername]);

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
