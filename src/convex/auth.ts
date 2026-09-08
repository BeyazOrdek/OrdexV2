// THIS FILE IS READ ONLY. Do not touch this file unless you are correctly adding a new auth provider in accordance to the vly auth documentation
// Adding the Password (username + password) provider below is exactly that:
// a new provider added per the Convex Auth documentation.

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { emailOtp } from "./auth/emailOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    emailOtp,
    Anonymous,
    Password({
      // ÖRDEX sign-up is username+password based; username is stored in the
      // users.email column (unique) so all three providers share one users
      // table and getAuthUserId works for every session type.
      profile: (params) => ({
        email: String(params.username ?? "").trim().toLowerCase(),
      }),
    }),
  ],
});
