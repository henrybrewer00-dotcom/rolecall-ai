import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useAction, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Logo, Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Send, Mic, Type, ArrowRight, Sparkles, Building2, AlertCircle, KeyRound, ArrowLeft } from "lucide-react";

type ChatMsg = { role: "assistant" | "user"; text: string };
type Profile = { name?: string; company?: string; title?: string; job?: string; context?: string };
type Enrichment = { summary: string; industry?: string; size?: string; website?: string; source: string };

export default function Onboarding() {
  const navigate = useNavigate();
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const onboardingChat = useAction(api.ai.onboardingChat);
  const enrichCompany = useAction(api.enrichment.enrichCompany);

  // An invite link pre-stashes a code → jump straight to joining that team.
  // Otherwise the user explicitly chooses to create a team or join one — nothing
  // happens automatically.
  const invited = (() => {
    const c = localStorage.getItem("rc_invite");
    return c && c.trim() ? c.toUpperCase() : null;
  })();
  const [code, setCode] = useState<string | null>(invited);
  const [mode, setMode] = useState<"choose" | "create" | "join">(invited ? "join" : "choose");
  const team = useQuery(api.users.orgByInvite, code ? { code } : "skip");

  function finishLocal() {
    localStorage.removeItem("rc_invite");
    navigate("/app", { replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className={cn("w-full animate-fade-up", mode === "create" ? "max-w-xl" : "max-w-lg")}>
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        {mode === "choose" && (
          <Chooser onCreate={() => setMode("create")} onJoin={() => setMode("join")} />
        )}

        {mode === "create" && (
          <ManagerIntake
            chat={onboardingChat}
            enrich={enrichCompany}
            complete={completeOnboarding}
            onDone={finishLocal}
            onBack={() => setMode("choose")}
          />
        )}

        {mode === "join" &&
          (code ? (
            <RepJoin
              code={code}
              team={team}
              complete={completeOnboarding}
              onDone={finishLocal}
              onBack={() => setCode(null)}
            />
          ) : (
            <CodeEntry onSubmit={(c) => setCode(c.toUpperCase())} onBack={() => setMode("choose")} />
          ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 0 — choose: create a team, or join one with a code (nothing is automatic)
// ─────────────────────────────────────────────────────────────────────────────
function Chooser({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <div className="glass-strong p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-ink-900">Welcome to RoleCall</h1>
      <p className="mt-1 text-sm text-ink-500">How do you want to get started?</p>

      <div className="mt-6 space-y-3">
        <button
          onClick={onCreate}
          className="glass group flex w-full items-center gap-4 p-4 text-left transition hover:shadow-glow"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-ink-900/15 bg-accent-300 text-ink-900">
            <Building2 className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-ink-900">Create a team</span>
            <span className="block text-sm text-ink-500">Set up a workspace and invite your reps.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-accent-600" />
        </button>

        <button
          onClick={onJoin}
          className="glass group flex w-full items-center gap-4 p-4 text-left transition hover:shadow-glow"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-ink-900/15 bg-white text-ink-900">
            <KeyRound className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold text-ink-900">Join with a code</span>
            <span className="block text-sm text-ink-500">Got an invite code from your manager? Enter it here.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-ink-400 transition group-hover:text-accent-600" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Join step — manually enter an invite code (when there's no invite link)
// ─────────────────────────────────────────────────────────────────────────────
function CodeEntry({ onSubmit, onBack }: { onSubmit: (code: string) => void; onBack: () => void }) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  return (
    <div className="glass-strong p-6 sm:p-8">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-700">
        <ArrowLeft className="h-3.5 w-3.5" /> back
      </button>
      <div className="grid h-12 w-12 place-items-center rounded-md bg-white text-ink-900">
        <KeyRound className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold text-ink-900">Enter your invite code</h1>
      <p className="mt-1 text-sm text-ink-500">Ask your manager for the team's code, then enter it below.</p>
      <div className="mt-6 space-y-4">
        <input
          className="input text-center font-mono text-lg uppercase tracking-[0.3em]"
          value={value}
          autoFocus
          maxLength={12}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && trimmed && onSubmit(trimmed)}
          placeholder="ABC123"
        />
        <Button className="w-full" disabled={!trimmed} onClick={() => trimmed && onSubmit(trimmed)}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rep path — short "join a team" screen
// ─────────────────────────────────────────────────────────────────────────────
type Team = { orgId: string; name: string; company: string; managerName: string } | null | undefined;

function RepJoin({
  code,
  team,
  complete,
  onDone,
  onBack,
}: {
  code: string;
  team: Team;
  complete: ReturnType<typeof useMutation<typeof api.users.completeOnboarding>>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (team === null) {
    return (
      <div className="glass-strong p-6 text-center sm:p-8">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-rose-50 text-rose-500">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-ink-900">That invite code isn't valid.</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Double-check it with your manager, or try a different one.
        </p>
        <Button variant="ghost" className="mt-6" onClick={onBack}>
          Try a different code
        </Button>
      </div>
    );
  }

  if (team === undefined) {
    return (
      <div className="glass-strong flex flex-col items-center gap-3 px-8 py-16 text-ink-500">
        <Spinner className="h-7 w-7 text-accent-500" />
        <span className="text-sm">Looking up your team…</span>
      </div>
    );
  }

  async function join() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await complete({ name: name.trim(), title: title.trim() || undefined, inviteCode: code });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-strong p-6 sm:p-8">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-700">
        <ArrowLeft className="h-3.5 w-3.5" /> back
      </button>
      <div className="grid h-12 w-12 place-items-center rounded-md bg-accent-50 text-accent-600">
        <Building2 className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-2xl font-extrabold text-ink-900">
        Join {team.managerName}'s team
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        You're joining <span className="font-semibold text-ink-700">{team.company}</span> on RoleCall.
      </p>

      <div className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <label className="label">Your full name</label>
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Jordan Lee"
          />
        </div>
        <div className="space-y-1.5">
          <label className="label">Title (optional)</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="Account Executive"
          />
        </div>
        {error && <p className="text-sm font-medium text-rose-500">{error}</p>}
        <Button className="w-full" loading={submitting} disabled={!name.trim()} onClick={join}>
          Join the team
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Manager path — conversational intake
// ─────────────────────────────────────────────────────────────────────────────
const OPENING: ChatMsg = {
  role: "assistant",
  text: "Hi! Let's set up your team. First — what's your name, and what company are you with?",
};

function ManagerIntake({
  chat,
  enrich,
  complete,
  onDone,
  onBack,
}: {
  chat: ReturnType<typeof useAction<typeof api.ai.onboardingChat>>;
  enrich: ReturnType<typeof useAction<typeof api.enrichment.enrichCompany>>;
  complete: ReturnType<typeof useMutation<typeof api.users.completeOnboarding>>;
  onDone: () => void;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([OPENING]);
  const [draft, setDraft] = useState("");
  const [profile, setProfile] = useState<Profile>({});
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const seeded = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // StrictMode guard so the opening message isn't duplicated.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const ready = Boolean(profile.name && profile.company);

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    const next = [...messages, { role: "user" as const, text }];
    setMessages(next);
    setDraft("");
    setThinking(true);
    try {
      const r = await chat({ messages: next });
      setMessages((m) => [...m, { role: "assistant" as const, text: r.message }]);
      setProfile(r.profile);
      if (r.done && r.profile.name && r.profile.company) setDone(true);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant" as const,
          text: "Sorry — I hit a snag. You can try again, or use \"Skip and type it\" below.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  // When the chat has gathered name + company, move to the finish/enrichment step.
  if (ready && (done || showForm)) {
    return <ManagerFinish profile={profile} enrich={enrich} complete={complete} onDone={onDone} />;
  }

  return (
    <div className="glass-strong flex flex-col overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-white/60 px-5 py-4 sm:px-6">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-accent-50 text-accent-600">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <div className="text-sm font-bold text-ink-900">Let's get you set up</div>
          <div className="text-xs text-ink-400">A couple of quick questions</div>
        </div>
        <button
          onClick={onBack}
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-400 transition hover:text-ink-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back
        </button>
      </div>

      <div ref={scrollRef} className="flex max-h-[52vh] flex-col gap-3 overflow-y-auto px-5 py-5 sm:px-6">
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {thinking && (
          <div className="glass-subtle inline-flex w-fit items-center gap-2 rounded-md rounded-bl-md px-4 py-2.5 text-ink-400">
            <Spinner className="h-3.5 w-3.5" />
            <span className="text-xs">Thinking…</span>
          </div>
        )}
      </div>

      <div className="border-t border-white/60 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <input
            className="input flex-1"
            value={draft}
            autoFocus
            disabled={thinking}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Type your answer…"
          />
          <Button onClick={send} disabled={!draft.trim() || thinking} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 flex flex-col items-start gap-2 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5" />
            Prefer to talk? You can read these aloud — voice onboarding is coming.
          </span>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent-600 hover:text-accent-700"
            >
              <Type className="h-3.5 w-3.5" />
              Skip and type it
            </button>
          )}
        </div>

        {showForm && !ready && (
          <QuickForm
            profile={profile}
            onChange={setProfile}
            onReady={() => {
              if (profile.name && profile.company) setDone(true);
            }}
          />
        )}
      </div>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-md px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "rounded-br-md text-white shadow-sm"
            : "glass-subtle rounded-bl-md text-ink-700",
        )}
        style={isUser ? { backgroundImage: "linear-gradient(135deg,#5f7d16,#33450e)" } : undefined}
      >
        {msg.text}
      </div>
    </div>
  );
}

// Fallback 4-field form revealed by "Skip and type it".
function QuickForm({
  profile,
  onChange,
  onReady,
}: {
  profile: Profile;
  onChange: (p: Profile) => void;
  onReady: () => void;
}) {
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...profile, [k]: e.target.value });

  return (
    <div className="mt-4 space-y-3 rounded-md border border-white/60 bg-white/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="label">Your name</label>
          <input className="input" value={profile.name ?? ""} onChange={set("name")} placeholder="Jordan Lee" />
        </div>
        <div className="space-y-1.5">
          <label className="label">Company</label>
          <input className="input" value={profile.company ?? ""} onChange={set("company")} placeholder="Acme Inc." />
        </div>
        <div className="space-y-1.5">
          <label className="label">Title (optional)</label>
          <input className="input" value={profile.title ?? ""} onChange={set("title")} placeholder="Director of Sales" />
        </div>
        <div className="space-y-1.5">
          <label className="label">What does your team sell? (optional)</label>
          <input className="input" value={profile.job ?? ""} onChange={set("job")} placeholder="Cloud security software" />
        </div>
      </div>
      <Button
        className="w-full"
        disabled={!profile.name?.trim() || !profile.company?.trim()}
        onClick={onReady}
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Enrichment + finish step.
function ManagerFinish({
  profile,
  enrich,
  complete,
  onDone,
}: {
  profile: Profile;
  enrich: ReturnType<typeof useAction<typeof api.enrichment.enrichCompany>>;
  complete: ReturnType<typeof useMutation<typeof api.users.completeOnboarding>>;
  onDone: () => void;
}) {
  const company = profile.company ?? "";
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // NB: no "alive" cleanup gate here — under StrictMode the ref guard already
    // prevents a double-run, and gating on cleanup would discard the only result.
    (async () => {
      try {
        const r = await enrich({ company });
        setEnrichment(r);
      } catch {
        setEnrichment(null); // best-effort — let the user finish regardless
      } finally {
        setLoading(false);
      }
    })();
  }, [enrich, company]);

  async function finish() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await complete({
        name: profile.name ?? "",
        company: profile.company,
        title: profile.title,
        job: profile.job,
        context: profile.context,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="glass-strong p-6 sm:p-8">
      {loading ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center text-ink-500">
          <Spinner className="h-8 w-8 text-accent-500" />
          <div>
            <div className="text-sm font-semibold text-ink-700">Setting you up at {company}…</div>
            <div className="mt-1 text-xs text-ink-400">Gathering a little context on your company.</div>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-extrabold text-ink-900">You're almost in, {profile.name}.</h1>
          {enrichment ? (
            <div className="mt-5 rounded-md border border-white/60 bg-white/50 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-ink-900">Here's what I found about {company}</h2>
                <span className="pill shrink-0">{enrichment.source}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-700">{enrichment.summary}</p>
              {(enrichment.industry || enrichment.size) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {enrichment.industry && <span className="pill">{enrichment.industry}</span>}
                  {enrichment.size && <span className="pill">{enrichment.size}</span>}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-500">
              We couldn't pull extra details on {company} right now — no problem, you can fill it in later.
            </p>
          )}

          {error && <p className="mt-4 text-sm font-medium text-rose-500">{error}</p>}

          <Button className="mt-6 w-full" loading={submitting} onClick={finish}>
            Enter RoleCall
            <ArrowRight className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
