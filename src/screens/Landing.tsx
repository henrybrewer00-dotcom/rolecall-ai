import { Link } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { Logo } from "@/components/ui";
import { HeroVisual } from "@/components/HeroVisual";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: "01",
    title: "Interview the AI",
    body: "Your senior closer talks through a deal while the AI asks sharp follow-ups — like onboarding the best new hire you never had to write a script for.",
  },
  {
    n: "02",
    title: "It builds a module",
    body: "The AI turns that expertise into a roleplay scenario plus the exact things every rep must nail — objections, framing, the close.",
  },
  {
    n: "03",
    title: "Reps practice & improve",
    body: "Reps run the scenario on live voice calls, get instant scores, and your dashboard fills in as the numbers climb.",
  },
];

const FEATURES = [
  {
    title: "AI interview → module",
    body: "Capture a top performer's instincts in one conversation and auto-generate a ready-to-ship training module.",
  },
  {
    title: "Live voice practice",
    body: "Reps don't read flashcards — they hold a real spoken conversation with an AI buyer in real time.",
  },
  {
    title: "Instant scored feedback",
    body: "Every call is scored the moment it ends, with a clear breakdown of what landed and what to fix.",
  },
  {
    title: "Manager dashboard",
    body: "Pass rates, score ranges, and per-rep drilldowns with recordings — see exactly who's ready.",
  },
  {
    title: "AI module suggestions",
    body: "The AI watches where reps struggle and drafts new modules to close the gaps automatically.",
  },
  {
    title: "Realistic AI buyers",
    body: "Skeptical, distracted, budget-obsessed — buyers that push back the way real prospects do.",
  },
];

type Plan = {
  name: string;
  price: string;
  cadence?: string;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
};

const PLANS: Plan[] = [
  {
    name: "Starter",
    price: "$0",
    cadence: "forever",
    tagline: "Try the full loop with your first team.",
    features: ["1 training module", "Up to 3 reps", "Live voice practice", "Basic scoring"],
    cta: "Start free",
  },
  {
    name: "Team",
    price: "$99",
    cadence: "/mo",
    tagline: "Everything a growing sales org needs.",
    features: ["Unlimited modules", "Up to 25 reps", "Manager dashboard", "AI module suggestions"],
    cta: "Start free trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    tagline: "Scale, security, and support.",
    features: ["SSO & SCIM", "Unlimited reps", "Custom integrations", "Dedicated success team"],
    cta: "Talk to sales",
  },
];

function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl lg:text-5xl">{title}</h2>
      {sub && <p className="mt-4 text-base leading-relaxed text-ink-700 sm:text-lg">{sub}</p>}
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useConvexAuth();
  const ctaTo = isAuthenticated ? "/app" : "/login";
  return (
    <div className="min-h-screen text-ink-900">
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 px-4 pt-4">
        <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-md px-5 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link to="/app" className="btn-primary text-sm">
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden rounded-full px-4 py-2 text-sm font-medium text-ink-700 transition-colors hover:text-ink-900 sm:inline-block"
                >
                  Sign in
                </Link>
                <Link to="/login" className="btn-primary text-sm">
                  Get started
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        {/* Hero */}
        <section className="grid items-center gap-10 py-12 sm:gap-12 sm:py-20 md:grid-cols-2 md:py-28">
          <div className="animate-fade-up">
            <span className="glass-subtle inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium text-accent-600">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-500 animate-pulse-soft" />
              Sales enablement, reimagined
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-ink-900 sm:text-5xl sm:leading-[1.05] lg:text-6xl">
              Turn your best closers&apos; instincts into training every rep can practice.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-700 sm:text-lg">
              A senior sales engineer gets interviewed by AI. It builds a roleplay module from their
              expertise. Reps practice it on live voice calls with an AI buyer, get instant scored
              feedback — and you watch the numbers climb.
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
              <Link to={ctaTo} className="btn-primary justify-center sm:justify-start">
                {isAuthenticated ? "Go to dashboard" : "Get started free"}
              </Link>
              <a
                href="#how-it-works"
                className="text-center text-sm font-semibold text-ink-700 underline-offset-4 transition-colors hover:text-accent-600 hover:underline sm:text-left"
              >
                Watch demo →
              </a>
            </div>
            <p className="mt-6 text-sm text-ink-400">
              No credit card required · Set up your first module in minutes
            </p>
          </div>

          <div className="flex justify-center">
            <HeroVisual className="animate-float" />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="py-14 sm:py-20">
          <SectionHeading
            title="How it works"
            sub="From one expert conversation to a whole team that practices like pros."
          />
          <div className="mt-10 grid gap-6 sm:mt-14 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="glass animate-fade-up rounded-lg p-6 sm:p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-accent-500 text-lg font-bold text-white">
                  {step.n}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-700">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature grid */}
        <section className="py-14 sm:py-20">
          <SectionHeading
            title="Everything the loop needs"
            sub="One platform that captures expertise, trains reps, and tells you who's ready."
          />
          <div className="mt-10 grid gap-6 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="glass-subtle rounded-lg p-6 transition-transform duration-300 hover:-translate-y-1 sm:p-7"
              >
                <h3 className="text-lg font-semibold text-ink-900">{feature.title}</h3>
                <p className="mt-3 leading-relaxed text-ink-700">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Built for both sides */}
        <section className="py-14 sm:py-20">
          <SectionHeading
            title="Built for both sides"
            sub="Leaders ship the playbook once. Reps practice it as much as they want."
          />
          <div className="mt-10 grid gap-6 sm:mt-14 md:grid-cols-2">
            <div className="glass-strong rounded-lg p-6 sm:p-9">
              <span className="text-sm font-semibold uppercase tracking-wide text-accent-600">
                For sales leaders
              </span>
              <h3 className="mt-3 text-xl font-bold text-ink-900 sm:text-2xl">
                Build once, distribute to everyone
              </h3>
              <p className="mt-4 leading-relaxed text-ink-700">
                Capture your best closer's approach a single time and push it to every rep. Watch
                pass rates and score ranges in real time, drill into any individual, and let the AI
                suggest where to coach next — so you always know who's ready.
              </p>
            </div>
            <div className="glass-strong rounded-lg p-6 sm:p-9">
              <span className="text-sm font-semibold uppercase tracking-wide text-accent-600">
                For reps
              </span>
              <h3 className="mt-3 text-xl font-bold text-ink-900 sm:text-2xl">
                Practice without the babysitting
              </h3>
              <p className="mt-4 leading-relaxed text-ink-700">
                Run as many live calls as you want, whenever you want. Get real, scored feedback the
                second you hang up — not a manager looking over your shoulder. Show up to the real
                call already warm.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="py-14 sm:py-20">
          <SectionHeading title="Simple pricing" sub="Start free. Upgrade when your team grows." />
          <div className="mt-10 grid items-start gap-6 sm:mt-14 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative rounded-lg p-6 sm:p-8",
                  plan.highlight ? "glass-strong ring-2 ring-accent-500 md:-translate-y-2" : "glass",
                )}
              >
                {plan.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent-500 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-ink-900">{plan.name}</h3>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-bold text-ink-900">{plan.price}</span>
                  {plan.cadence && <span className="pb-1 text-ink-500">{plan.cadence}</span>}
                </div>
                <p className="mt-3 text-sm text-ink-500">{plan.tagline}</p>
                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-ink-700">
                      <span className="mt-1 text-accent-600">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to={ctaTo}
                  className={cn("mt-8 block text-center", plan.highlight ? "btn-primary" : "btn-ghost")}
                >
                  {isAuthenticated ? "Go to dashboard" : plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="px-4 pb-12 pt-10">
        <div className="glass mx-auto flex max-w-6xl flex-col items-center gap-4 rounded-lg px-8 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-2 sm:items-start">
            <Logo />
            <p className="text-sm text-ink-500">
              Turn expert instincts into training every rep can practice.
            </p>
          </div>
          <p className="text-sm text-ink-400">© 2026 RoleCall AI</p>
        </div>
      </footer>
    </div>
  );
}
