import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  LayoutDashboard,
  Sparkles,
  Activity,
  GraduationCap,
  Target,
  Settings,
  Layers,
  LogOut,
  ChevronRight,
  Trophy,
  History as HistoryIcon,
  BrainCircuit,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { EqIcon } from "./ui";
import { cn, initials } from "@/lib/utils";

type NavItem = { label: string; short?: string; to: string; icon: LucideIcon; badge?: number };

const transition = { type: "tween" as const, ease: "easeOut" as const, duration: 0.2 };

export function AppShell() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();
  const viewer = useQuery(api.users.viewer);
  const seedState = useQuery(api.seed.seedState);
  const seed = useMutation(api.seed.seed);

  const isManager = viewer?.role === "manager";
  // Notification counts (variant-3 badges).
  const suggestions = useQuery(api.suggestions.listPending, isManager ? {} : "skip");
  const repModules = useQuery(api.assignments.listForRep, isManager ? "skip" : {});

  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (seedState && seedState.needsSeed) seed().catch(() => {});
  }, [seedState, seed]);

  const pendingSuggestions = suggestions?.length ?? 0;
  const unstarted = (repModules ?? []).filter((m: any) => m.attemptCount === 0).length;

  const navItems: NavItem[] = isManager
    ? [
        { label: "Dashboard", short: "Home", to: "/app", icon: LayoutDashboard, badge: pendingSuggestions },
        { label: "Modules", to: "/app/modules", icon: Layers },
        { label: "Create module", short: "Create", to: "/app/create", icon: Sparkles },
        { label: "Hivemind", short: "Hive", to: "/app/hivemind", icon: BrainCircuit },
        { label: "History", to: "/app/history", icon: HistoryIcon },
        { label: "Integrations", short: "Apps", to: "/app/integrations", icon: Plug },
        { label: "Leaderboard", short: "Board", to: "/app/leaderboard", icon: Trophy },
        { label: "All activity", short: "Activity", to: "/app/activity", icon: Activity },
      ]
    : [
        { label: "My training", short: "Training", to: "/app", icon: GraduationCap, badge: unstarted },
        { label: "Practice", to: "/app/drills", icon: Target },
        { label: "Hivemind", short: "Hive", to: "/app/hivemind", icon: BrainCircuit },
        { label: "History", to: "/app/history", icon: HistoryIcon },
        { label: "Integrations", short: "Apps", to: "/app/integrations", icon: Plug },
        { label: "Leaderboard", short: "Board", to: "/app/leaderboard", icon: Trophy },
      ];

  const isActive = (to: string) => (to === "/app" ? location.pathname === "/app" : location.pathname.startsWith(to));

  // Close the mobile profile sheet whenever we navigate.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      {/* ===== Mobile top bar ===== */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-ink-900/[0.08] bg-white/95 px-4 backdrop-blur md:hidden">
        <button onClick={() => navigate("/app")} className="flex items-center gap-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-md"
            style={{ backgroundImage: "linear-gradient(135deg,#d4f55e,#aedb24)", color: "#0a0c10" }}
          >
            <EqIcon className="h-4 w-4" animate />
          </span>
          <span className="text-sm font-bold text-ink-900">
            RoleCall<span className="text-accent-600"> AI</span>
          </span>
        </button>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="grid h-9 w-9 place-items-center rounded-full bg-accent-300 text-xs font-bold text-ink-900"
        >
          {initials(viewer?.name ?? viewer?.email ?? "You")}
        </button>
      </header>

      {/* ===== Mobile profile sheet ===== */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 bg-ink-900/30 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              key="sheet"
              className="fixed inset-x-0 top-14 z-50 mx-3 overflow-hidden rounded-md border border-ink-900/10 bg-white shadow-xl md:hidden"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.16 }}
            >
              <div className="border-b border-ink-900/[0.06] px-4 py-3">
                <div className="truncate text-sm font-semibold text-ink-900">{viewer?.name ?? "You"}</div>
                <div className="truncate text-xs text-ink-400">{viewer?.email}</div>
                <div className="mt-0.5 text-[11px] font-medium text-accent-700">{isManager ? "Sales Manager" : "Rep"}</div>
              </div>
              <button
                onClick={() => navigate("/app/settings")}
                className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
              >
                <Settings className="h-4 w-4" /> Settings
              </button>
              <button
                onClick={async () => {
                  await signOut();
                  navigate("/");
                }}
                className="flex w-full items-center gap-2 border-t border-ink-900/[0.06] px-4 py-3 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== Mobile bottom tab bar ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-ink-900/[0.08] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
        {navItems.map((item) => {
          const active = isActive(item.to);
          const Icon = item.icon;
          return (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className={cn(
                "relative flex min-w-[3.75rem] flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors",
                active ? "text-ink-900" : "text-ink-400",
              )}
            >
              <span className="relative">
                <Icon className={cn("h-5 w-5", active && "text-accent-600")} />
                {!!item.badge && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[9px] font-bold text-ink-900">
                    {item.badge}
                  </span>
                )}
              </span>
              <span className="max-w-[68px] truncate">{item.short ?? item.label}</span>
              {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent-500" />}
            </button>
          );
        })}
      </nav>

      {/* ===== Desktop hover-expand sidebar ===== */}
      <motion.aside
        className="fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-ink-900/[0.08] md:flex"
        style={{ background: "#ffffff", boxShadow: "0 0 50px -24px rgba(20,22,26,0.25)" }}
        initial={false}
        animate={{ width: expanded ? 248 : 72 }}
        transition={transition}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => {
          setExpanded(false);
          setMenuOpen(false);
        }}
      >
        {/* Brand / team */}
        <div className="flex h-16 items-center gap-3 px-[18px]">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-white"
            style={{ backgroundImage: "linear-gradient(135deg,#d4f55e,#aedb24)", color: "#0a0c10" }}
          >
            <EqIcon className="h-4 w-4" animate />
          </span>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="min-w-0"
              >
                <div className="truncate text-sm font-bold text-ink-900">
                  RoleCall<span className="text-accent-600"> AI</span>
                </div>
                <div className="truncate text-[11px] text-ink-400">{viewer?.company ?? "Sales enablement"}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className={cn(
                  "group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                  active ? "bg-accent-300/40 text-ink-900" : "text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900",
                )}
              >
                <span className="relative shrink-0">
                  <Icon className="h-5 w-5" />
                  {/* collapsed badge dot */}
                  {!expanded && !!item.badge && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent-500 px-1 text-[9px] font-bold text-ink-900">
                      {item.badge}
                    </span>
                  )}
                </span>
                <AnimatePresence>
                  {expanded && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className="flex flex-1 items-center justify-between whitespace-nowrap"
                    >
                      {item.label}
                      {!!item.badge && (
                        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-accent-500 px-1.5 text-[11px] font-bold text-ink-900">
                          {item.badge}
                        </span>
                      )}
                    </motion.span>
                  )}
                </AnimatePresence>
                {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent-500" />}
              </button>
            );
          })}
        </nav>

        {/* Profile + sign out */}
        <div className="border-t border-ink-900/[0.06] p-3">
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-ink-900/[0.04]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-300 text-xs font-bold text-ink-900">
                {initials(viewer?.name ?? viewer?.email ?? "You")}
              </span>
              <AnimatePresence>
                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="flex min-w-0 flex-1 items-center justify-between"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-900">{viewer?.name ?? "You"}</span>
                      <span className="block truncate text-[11px] text-ink-400">{isManager ? "Sales Manager" : "Rep"}</span>
                    </span>
                    <ChevronRight className={cn("h-4 w-4 text-ink-400 transition-transform", menuOpen && "rotate-90")} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
            <AnimatePresence>
              {menuOpen && expanded && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-md border border-ink-900/10 bg-white shadow-lg"
                >
                  <div className="border-b border-ink-900/[0.06] px-3 py-2">
                    <div className="truncate text-xs font-medium text-ink-700">{viewer?.email}</div>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/app/settings");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <button
                    onClick={async () => {
                      await signOut();
                      navigate("/");
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.aside>

      {/* Content */}
      <main className="min-h-screen pl-0 md:pl-[72px]">
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-[4.5rem] sm:px-6 md:pb-8 md:pt-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
