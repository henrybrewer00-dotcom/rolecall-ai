import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link } from "react-router-dom";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ArrowLeft, Check, Plug, RefreshCw, Search, ShieldCheck } from "lucide-react";

type Conn = { id: string; toolkitSlug: string; status: string };

const ACTIVE = new Set(["ACTIVE", "CONNECTED"]);
const PENDING = new Set(["INITIATED", "INITIALIZING", "PENDING"]);

export default function Integrations() {
  const catalog = useQuery(api.integrations.catalog);
  const listConnections = useAction(api.integrations.listConnections);
  const connect = useAction(api.integrations.connect);
  const disconnect = useAction(api.integrations.disconnect);

  const [conns, setConns] = useState<Record<string, Conn>>({});
  const [loadingConns, setLoadingConns] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listConnections({});
      const map: Record<string, Conn> = {};
      for (const r of rows) if (r.toolkitSlug) map[r.toolkitSlug] = r;
      setConns(map);
    } catch {
      /* surfaced via the cards staying "not connected" */
    } finally {
      setLoadingConns(false);
    }
  }, [listConnections]);

  // Initial load + refetch when returning from the OAuth tab.
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refresh]);

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    let ticks = 0;
    pollRef.current = setInterval(() => {
      ticks += 1;
      refresh();
      if (ticks > 40 && pollRef.current) clearInterval(pollRef.current); // ~2 min cap
    }, 3000);
  }, [refresh]);

  const handleConnect = async (slug: string) => {
    setBusy((b) => ({ ...b, [slug]: true }));
    try {
      const { redirectUrl } = await connect({ slug });
      window.open(redirectUrl, "_blank", "noopener,noreferrer");
      startPolling();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy((b) => ({ ...b, [slug]: false }));
    }
  };

  const handleDisconnect = async (slug: string) => {
    const c = conns[slug];
    if (!c) return;
    setBusy((b) => ({ ...b, [slug]: true }));
    try {
      await disconnect({ connectedAccountId: c.id });
      setConns((m) => {
        const n = { ...m };
        delete n[slug];
        return n;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setBusy((b) => ({ ...b, [slug]: false }));
    }
  };

  const filtered = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return q
      ? catalog.filter(
          (c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
        )
      : catalog;
  }, [catalog, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const c of filtered) {
      const arr = m.get(c.category) ?? [];
      arr.push(c);
      m.set(c.category, arr);
    }
    return [...m.entries()];
  }, [filtered]);

  const connectedCount = Object.values(conns).filter((c) => ACTIVE.has(c.status)).length;

  if (catalog === undefined) {
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-8 w-8 text-accent-500" />
      </div>
    );
  }

  return (
    <div className="w-full animate-fade-up space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          to="/app"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">Integrations</h1>
            <p className="text-sm text-ink-500">
              Connect your tools in one click — OAuth is handled for you, no API keys to paste.
            </p>
          </div>
          <button
            onClick={refresh}
            className="pill cursor-pointer text-ink-600 transition hover:text-ink-900"
            title="Refresh status"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingConns && "animate-spin")} /> Refresh
          </button>
        </div>
      </div>

      {/* Banner */}
      <div className="glass-strong flex items-center gap-3 px-5 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-300/40 text-accent-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-bold text-ink-900">
            {connectedCount > 0 ? `${connectedCount} connected` : "Powered by Composio"}
          </div>
          <p className="text-xs text-ink-500">
            Secure OAuth via Composio — RoleCall never sees your passwords or keys.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          className="input pl-9"
          placeholder="Search integrations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Grouped grid */}
      {grouped.length === 0 ? (
        <div className="glass px-5 py-10 text-center text-sm text-ink-500">No integrations match “{query}”.</div>
      ) : (
        grouped.map(([category, items]) => (
          <section key={category} className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">{category}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => {
                const conn = conns[item.slug];
                const isActive = conn ? ACTIVE.has(conn.status) : false;
                const isPending = conn ? PENDING.has(conn.status) : false;
                const isBusy = busy[item.slug];
                return (
                  <div
                    key={item.slug}
                    className={cn(
                      "flex items-start gap-3 rounded-md border bg-white p-4 transition",
                      isActive ? "border-accent-500/60" : "border-ink-900/[0.12] hover:border-ink-900/30",
                    )}
                  >
                    <Logo slug={item.slug} logo={item.logo} name={item.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-ink-900">{item.name}</span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded-[3px] bg-accent-100 px-1.5 py-0.5 text-[10px] font-bold text-accent-700">
                            <Check className="h-3 w-3" strokeWidth={3} /> Connected
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">{item.description}</p>
                      <div className="mt-2.5">
                        {isActive ? (
                          <button
                            onClick={() => handleDisconnect(item.slug)}
                            disabled={isBusy}
                            className="text-xs font-semibold text-ink-400 transition hover:text-rose-600 disabled:opacity-50"
                          >
                            {isBusy ? "Disconnecting…" : "Disconnect"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConnect(item.slug)}
                            disabled={isBusy || isPending}
                            className="btn-primary !px-3 !py-1.5 !text-xs"
                          >
                            {isBusy ? (
                              <>
                                <Spinner className="h-3.5 w-3.5" /> Opening…
                              </>
                            ) : isPending ? (
                              <>
                                <Spinner className="h-3.5 w-3.5" /> Connecting…
                              </>
                            ) : (
                              <>
                                <Plug className="h-3.5 w-3.5" /> Connect
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** Composio logo with a graceful letter-avatar fallback. */
function Logo({ slug, logo, name }: { slug: string; logo: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-ink-900/[0.06] text-sm font-bold text-ink-500">
        {name[0]}
      </span>
    );
  }
  return (
    <img
      src={logo}
      alt={`${name} logo`}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-md border border-ink-900/[0.08] bg-white object-contain p-1.5"
      data-slug={slug}
    />
  );
}
