import { useState, type ReactNode } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { Button, Spinner } from "@/components/ui";
import { cn, initials } from "@/lib/utils";
import {
  Mail,
  Shield,
  Building2,
  Copy,
  Check,
  KeyRound,
  Ticket,
  Link2,
  Globe,
} from "lucide-react";

export default function Settings() {
  const viewer = useQuery(api.users.viewer);

  if (viewer === undefined) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="h-7 w-7 text-accent-500" />
      </div>
    );
  }

  if (viewer === null) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-ink-500">
        You need to be signed in to view your settings.
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6 animate-fade-up">
      <header className="space-y-1">
        <h1 className="text-xl font-extrabold tracking-tight text-ink-900 sm:text-2xl">Settings</h1>
        <p className="text-sm text-ink-500">Manage your profile and account.</p>
      </header>

      <ProfileCard viewer={viewer} />
      {viewer.role === "manager" && <CompanyCard />}
      <AccountCard viewer={viewer} />
      <SecurityCard viewer={viewer} />
    </div>
  );
}

type Viewer = {
  name?: string;
  email?: string;
  role: "rep" | "manager" | null;
  title?: string;
  job?: string;
  company?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Profile
// ─────────────────────────────────────────────────────────────────────────────
function ProfileCard({ viewer }: { viewer: Viewer }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const isManager = viewer.role === "manager";

  // Re-seed local state whenever the viewer identity/values change.
  const seedKey = `${viewer.name ?? ""}|${viewer.title ?? ""}|${viewer.job ?? ""}`;
  const [key, setKey] = useState(seedKey);
  const [name, setName] = useState(viewer.name ?? "");
  const [title, setTitle] = useState(viewer.title ?? "");
  const [job, setJob] = useState(viewer.job ?? "");
  if (key !== seedKey) {
    setKey(seedKey);
    setName(viewer.name ?? "");
    setTitle(viewer.title ?? "");
    setJob(viewer.job ?? "");
  }

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const trimmedName = name.trim();
  const unchanged =
    trimmedName === (viewer.name ?? "").trim() &&
    title.trim() === (viewer.title ?? "").trim() &&
    (!isManager || job.trim() === (viewer.job ?? "").trim());
  const disabled = saving || unchanged || trimmedName.length === 0;

  async function save() {
    if (disabled) return;
    setSaving(true);
    try {
      await updateProfile({
        name: trimmedName,
        title: title.trim(),
        ...(isManager ? { job: job.trim() } : {}),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const label = viewer.name ?? viewer.email ?? "";

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-center gap-4">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-400 to-accent-400 text-xl font-extrabold text-white shadow-glow">
          {initials(label)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-ink-900">{viewer.name ?? "Your profile"}</h2>
          <p className="truncate text-sm text-ink-500">{viewer.title ?? (isManager ? "Sales Manager" : "Sales Rep")}</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <Field label="Full name" htmlFor="settings-name">
          <input
            id="settings-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Cooper"
            autoComplete="name"
          />
        </Field>

        <Field label="Title" htmlFor="settings-title">
          <input
            id="settings-title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isManager ? "Sales Manager" : "Account Executive"}
            autoComplete="organization-title"
          />
        </Field>

        {isManager && (
          <Field label="What your team sells" htmlFor="settings-job">
            <input
              id="settings-job"
              className="input"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder="B2B payroll software to mid-market HR teams"
            />
          </Field>
        )}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" loading={saving} disabled={disabled} onClick={save}>
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-600 animate-fade-up">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Company (manager only) — grounds the AI's module-building.
// ─────────────────────────────────────────────────────────────────────────────
function CompanyCard() {
  const company = useQuery(api.users.myCompany);
  const updateCompany = useMutation(api.users.updateCompany);

  const [seed, setSeed] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [about, setAbout] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const seedKey = company ? `${company.company}|${company.website}|${company.context}` : null;
  if (company && seedKey !== seed) {
    setSeed(seedKey);
    setName(company.company);
    setWebsite(company.website);
    setAbout(company.context);
  }

  if (company === undefined) {
    return (
      <section className="glass grid place-items-center p-8">
        <Spinner className="h-6 w-6 text-accent-500" />
      </section>
    );
  }
  if (company === null) return null;

  const unchanged =
    name.trim() === company.company.trim() &&
    website.trim() === company.website.trim() &&
    about.trim() === company.context.trim();
  const disabled = saving || unchanged;

  async function save() {
    if (disabled) return;
    setSaving(true);
    try {
      await updateCompany({ company: name.trim(), website: website.trim(), context: about.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-300/30 text-accent-600">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-bold text-ink-900">Company</h2>
          <p className="text-xs text-ink-500">Used to ground the AI when it builds your modules.</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <Field label="Company name" htmlFor="settings-company">
          <input
            id="settings-company"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Northwind Software"
            autoComplete="organization"
          />
        </Field>

        <Field label="Website" htmlFor="settings-website">
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="settings-website"
              className="input pl-9"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://northwind.com"
              autoComplete="url"
              inputMode="url"
            />
          </div>
        </Field>

        <Field label="About your company" htmlFor="settings-about">
          <textarea
            id="settings-about"
            className="input min-h-[96px] resize-y"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="What you sell, who you sell to, your sales motion, and the buyers reps face."
          />
        </Field>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Button variant="primary" loading={saving} disabled={disabled} onClick={save}>
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-accent-600 animate-fade-up">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="label block">
        {label}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Account
// ─────────────────────────────────────────────────────────────────────────────
function AccountCard({ viewer }: { viewer: Viewer }) {
  const isManager = viewer.role === "manager";
  const invite = useQuery(api.users.myInvite, isManager ? {} : "skip");

  return (
    <section className="glass p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">Account</h2>
      <p className="mt-0.5 text-sm text-ink-500">Your identity and team details.</p>

      <dl className="mt-5 divide-y divide-ink-100">
        <Row icon={<Mail className="h-4 w-4" />} label="Email">
          <span className="text-sm text-ink-900">{viewer.email ?? "—"}</span>
        </Row>

        <Row icon={<Shield className="h-4 w-4" />} label="Role">
          <span className="pill">{isManager ? "Sales Manager" : "Sales Rep"}</span>
        </Row>

        <Row icon={<Building2 className="h-4 w-4" />} label="Company / Team">
          <span className="text-sm text-ink-900">{viewer.company ?? "—"}</span>
        </Row>
      </dl>

      {isManager && invite && invite.code && (
        <div className="mt-5 space-y-3 border-t border-ink-100 pt-5">
          <CopyField
            icon={<Ticket className="h-4 w-4" />}
            label="Invite code"
            value={invite.code}
            display={invite.code}
            mono
          />
          <CopyField
            icon={<Link2 className="h-4 w-4" />}
            label="Invite link"
            value={`${window.location.origin}/join/${invite.code}`}
            display={`${window.location.origin}/join/${invite.code}`}
          />
        </div>
      )}
    </section>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="flex items-center gap-2.5 text-sm text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

function CopyField({
  icon,
  label,
  value,
  display,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  display: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; fail silently.
    }
  }

  return (
    <div>
      <span className="label flex items-center gap-2">
        <span className="text-ink-400">{icon}</span>
        {label}
      </span>
      <div className="mt-1.5 flex items-center gap-2">
        <code
          className={cn(
            "surface flex-1 truncate px-3 py-2 text-sm text-ink-900",
            mono && "font-mono tracking-wider",
          )}
        >
          {display}
        </code>
        <Button variant="ghost" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-accent-600" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Security
// ─────────────────────────────────────────────────────────────────────────────
function SecurityCard({ viewer }: { viewer: Viewer }) {
  const { signIn } = useAuthActions();
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  async function resetPassword() {
    setRequesting(true);
    try {
      await signIn(
        "password",
        (() => {
          const f = new FormData();
          f.set("flow", "reset");
          f.set("email", viewer.email ?? "");
          return f;
        })(),
      );
    } catch {
      // No email provider is configured in this demo; we surface a note either way.
    } finally {
      setRequesting(false);
      setRequested(true);
    }
  }

  return (
    <section className="glass p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink-900">Security</h2>
      <p className="mt-0.5 text-sm text-ink-500">Keep your account secure.</p>

      <div className="mt-5 flex items-center justify-between gap-4 border-t border-ink-100 pt-4">
        <span className="flex items-center gap-2.5 text-sm text-ink-500">
          <span className="text-ink-400">
            <KeyRound className="h-4 w-4" />
          </span>
          Password
        </span>
        <Button variant="ghost" loading={requesting} onClick={resetPassword}>
          Reset password
        </Button>
      </div>

      {requested && (
        <p className="mt-3 rounded-md border border-accent-300/50 bg-accent-50 px-4 py-3 text-sm text-ink-600 animate-fade-up">
          If email is configured for this workspace, a reset link is on its way to{" "}
          <span className="font-semibold text-ink-900">{viewer.email ?? "your inbox"}</span>.
          <span className="text-ink-400"> (Email delivery isn't set up in this local demo yet.)</span>
        </p>
      )}
    </section>
  );
}
