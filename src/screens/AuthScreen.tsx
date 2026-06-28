import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import { Logo, Button } from "@/components/ui";

export default function AuthScreen() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signUp");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    formData.set("flow", flow);
    try {
      await signIn("password", formData);
      navigate("/app");
    } catch {
      setError(flow === "signIn" ? "Couldn't sign in. Check your details." : "Couldn't create account. Try a stronger password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    try {
      await signIn("google", { redirectTo: "/app" });
    } catch {
      setError("Google sign-in isn't configured yet (set AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex justify-center"><Logo /></Link>
        <div className="glass-strong p-6 sm:p-8">
          <h1 className="text-xl font-extrabold text-ink-900">
            {flow === "signIn" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            {flow === "signIn" ? "Sign in to your workspace." : "Train your team in minutes."}
          </p>

          <button
            onClick={handleGoogle}
            className="btn-ghost mt-6 w-full"
            type="button"
          >
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs font-medium text-ink-400">
            <div className="h-px flex-1 bg-ink-900/10" /> or <div className="h-px flex-1 bg-ink-900/10" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            <div className="space-y-1.5">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required className="input" placeholder="you@company.com" />
            </div>
            <div className="space-y-1.5">
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete={flow === "signIn" ? "current-password" : "new-password"} required className="input" placeholder="••••••••" />
            </div>
            {error && <p className="text-sm text-rose-500">{error}</p>}
            <Button type="submit" loading={submitting} className="w-full">
              {flow === "signIn" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-500">
            {flow === "signIn" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => { setError(null); setFlow(flow === "signIn" ? "signUp" : "signIn"); }}
              className="font-bold text-accent-600 hover:text-accent-700"
            >
              {flow === "signIn" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}
