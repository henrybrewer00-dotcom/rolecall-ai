import { Password } from "@convex-dev/auth/providers/Password";
import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Google OAuth requires AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET on the deployment.
// Password works with no extra config and is always available.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password, Google],
});
