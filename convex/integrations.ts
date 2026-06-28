import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { api, internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// Composio integrations — connect third-party tools (CRM, email, calendar, …)
// via Composio's MANAGED OAuth, so reps/managers never paste API keys.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://backend.composio.dev/api/v3";

/** A curated catalog of sales-relevant tools that support Composio-managed OAuth. */
export type CatalogItem = { slug: string; name: string; category: string; description: string };

// Curated to the tools a sales team actually runs on — CRM, inbox, calendar,
// call recordings, and team chat. (Composio supports many more, but a sales
// enablement workspace only needs these.)
export const CATALOG: CatalogItem[] = [
  // CRM
  { slug: "salesforce", name: "Salesforce", category: "CRM", description: "Sync accounts, opportunities, and contacts." },
  { slug: "hubspot", name: "HubSpot", category: "CRM", description: "Pull deals, contacts, and pipeline data." },
  { slug: "zoho", name: "Zoho CRM", category: "CRM", description: "Connect leads, deals, and accounts." },
  // Email
  { slug: "gmail", name: "Gmail", category: "Email", description: "Read and draft prospecting emails." },
  { slug: "outlook", name: "Outlook", category: "Email", description: "Microsoft 365 email and contacts." },
  // Scheduling
  { slug: "googlecalendar", name: "Google Calendar", category: "Scheduling", description: "Book follow-ups straight from a call." },
  { slug: "calendly", name: "Calendly", category: "Scheduling", description: "Share booking links and track meetings." },
  // Calls & meetings
  { slug: "gong", name: "Gong", category: "Calls & Meetings", description: "Import real call recordings & insights." },
  { slug: "zoom", name: "Zoom", category: "Calls & Meetings", description: "Pull recordings of live sales calls." },
  { slug: "googlemeet", name: "Google Meet", category: "Calls & Meetings", description: "Schedule and join meet calls." },
  // Team chat
  { slug: "slack", name: "Slack", category: "Team Chat", description: "Push wins and coaching nudges to channels." },
  { slug: "microsoft_teams", name: "Microsoft Teams", category: "Team Chat", description: "Notify reps and managers in Teams." },
];

function logoFor(slug: string): string {
  return `https://logos.composio.dev/api/${slug}`;
}

function apiKey(): string {
  const k = process.env.COMPOSIO_API_KEY;
  if (!k) throw new Error("COMPOSIO_API_KEY is not set on this Convex deployment.");
  return k;
}

async function composio(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.text();
  let json: any;
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    json = body;
  }
  if (!res.ok) {
    const msg = typeof json === "string" ? json : JSON.stringify(json);
    throw new Error(`Composio ${path} → ${res.status}: ${msg}`);
  }
  return json;
}

// ── DB helpers (actions can't touch the db directly) ─────────────────────────
export const getAuthConfigId = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query("composioAuthConfigs")
      .withIndex("by_slug", (q) => q.eq("toolkitSlug", slug))
      .first();
    return row?.authConfigId ?? null;
  },
});

export const saveAuthConfigId = internalMutation({
  args: { slug: v.string(), authConfigId: v.string() },
  handler: async (ctx, { slug, authConfigId }) => {
    const existing = await ctx.db
      .query("composioAuthConfigs")
      .withIndex("by_slug", (q) => q.eq("toolkitSlug", slug))
      .first();
    if (existing) await ctx.db.patch(existing._id, { authConfigId });
    else await ctx.db.insert("composioAuthConfigs", { toolkitSlug: slug, authConfigId });
  },
});

// ── Public API ───────────────────────────────────────────────────────────────

/** The static catalog (instant, no Composio round-trip). */
export const catalog = query({
  args: {},
  handler: async () =>
    CATALOG.map((c) => ({ ...c, logo: logoFor(c.slug) })),
});

/** The current user's connected accounts, keyed by toolkit slug. */
export const listConnections = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ id: string; toolkitSlug: string; status: string }[]> => {
    const viewer = await ctx.runQuery(api.users.viewer, {});
    if (!viewer) return [];
    const userId = viewer._id as string;
    const data = await composio(
      `/connected_accounts?user_ids=${encodeURIComponent(userId)}&limit=200`,
    );
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    return items
      .filter((i) => (i.user_id ?? i.userId) === userId)
      .map((i) => ({
        id: String(i.id),
        toolkitSlug: String(i.toolkit?.slug ?? ""),
        status: String(i.status ?? "UNKNOWN"),
      }));
  },
});

/** Begin connecting a tool: returns the Composio-hosted OAuth URL to open. */
export const connect = action({
  args: { slug: v.string() },
  handler: async (ctx, { slug }): Promise<{ redirectUrl: string; connectedAccountId: string }> => {
    if (!CATALOG.some((c) => c.slug === slug)) throw new Error(`Unknown integration: ${slug}`);
    const viewer = await ctx.runQuery(api.users.viewer, {});
    if (!viewer) throw new Error("Not authenticated");
    const userId = viewer._id as string;

    // Reuse a cached managed auth config, or create one for this toolkit.
    let authConfigId = await ctx.runQuery(internal.integrations.getAuthConfigId, { slug });
    if (!authConfigId) {
      const created = await composio(`/auth_configs`, {
        method: "POST",
        body: JSON.stringify({ toolkit: { slug }, auth_config: { type: "use_composio_managed_auth" } }),
      });
      authConfigId = created?.auth_config?.id ?? created?.id;
      if (!authConfigId) throw new Error("Composio did not return an auth_config id.");
      await ctx.runMutation(internal.integrations.saveAuthConfigId, { slug, authConfigId });
    }

    const callbackUrl = (process.env.SITE_URL ?? "https://rolecallai.vercel.app") + "/app/integrations";
    const conn = await composio(`/connected_accounts`, {
      method: "POST",
      body: JSON.stringify({
        auth_config: { id: authConfigId },
        connection: { user_id: userId, callback_url: callbackUrl },
      }),
    });
    const redirectUrl = conn?.redirect_url ?? conn?.redirectUrl;
    if (!redirectUrl) throw new Error("Composio did not return a redirect URL.");
    return { redirectUrl: String(redirectUrl), connectedAccountId: String(conn?.id ?? "") };
  },
});

/** Disconnect a connected account. */
export const disconnect = action({
  args: { connectedAccountId: v.string() },
  handler: async (_ctx, { connectedAccountId }): Promise<{ ok: boolean }> => {
    await composio(`/connected_accounts/${connectedAccountId}`, { method: "DELETE" });
    return { ok: true };
  },
});
