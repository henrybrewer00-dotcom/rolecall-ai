// Shared Composio tool-calling utilities: let the LLM pull LIVE data from a
// user's connected integrations (CRM / email / calendar) via Composio's managed
// OAuth. Used by ai.aiSearch (answer questions) and ai.generateModule (build a
// roleplay from a real prospect). Plain helpers — imported by the node actions.

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3";

/** Prefer Cerebras (near-instant) when configured; fall back to OpenAI. */
function llm(): { url: string; key: string | undefined; model: string } {
  const cerebras = process.env.CEREBRAS_API_KEY;
  if (cerebras) return { url: "https://api.cerebras.ai/v1/chat/completions", key: cerebras, model: "gemma-4-31b" };
  return { url: "https://api.openai.com/v1/chat/completions", key: process.env.OPENAI_API_KEY, model: "gpt-4o" };
}

/** A small, verified set of READ tools per toolkit — keeps the LLM focused and
 *  avoids dumping the hundreds of actions each toolkit exposes. */
const CURATED_TOOLS: Record<string, string[]> = {
  hubspot: ["HUBSPOT_HUBSPOT_SEARCH_DEALS", "HUBSPOT_HUBSPOT_SEARCH_COMPANIES"],
  salesforce: ["SALESFORCE_EXECUTE_SOQL_QUERY", "SALESFORCE_LIST_CONTACTS", "SALESFORCE_LIST_ACCOUNTS"],
  gmail: ["GMAIL_FETCH_EMAILS"],
  googlecalendar: ["GOOGLECALENDAR_EVENTS_LIST", "GOOGLECALENDAR_FIND_EVENT"],
};

function composioKey(): string | null {
  return process.env.COMPOSIO_API_KEY ?? null;
}

async function composioFetch(path: string, init?: RequestInit): Promise<any> {
  const key = composioKey();
  if (!key) throw new Error("COMPOSIO_API_KEY not set");
  const res = await fetch(`${COMPOSIO_BASE}${path}`, {
    ...init,
    headers: { "x-api-key": key, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = text;
  }
  if (!res.ok) throw new Error(`Composio ${path} ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  return json;
}

/** Active connected toolkits for a user that we have curated tools for. */
export async function activeToolkits(userId: string): Promise<string[]> {
  if (!composioKey()) return [];
  try {
    const data = await composioFetch(`/connected_accounts?user_ids=${encodeURIComponent(userId)}&limit=200`);
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const active = new Set<string>();
    for (const i of items) {
      const slug = i?.toolkit?.slug;
      const status = String(i?.status ?? "");
      const owner = i?.user_id ?? i?.userId;
      if (slug && owner === userId && (status === "ACTIVE" || status === "CONNECTED") && CURATED_TOOLS[slug]) {
        active.add(slug);
      }
    }
    return [...active];
  } catch {
    return [];
  }
}

type OpenAITool = { type: "function"; function: { name: string; description: string; parameters: any } };

/** Build OpenAI tool definitions from the curated tools of the given toolkits. */
async function toolDefsFor(toolkitSlugs: string[]): Promise<OpenAITool[]> {
  const slugs = toolkitSlugs.flatMap((tk) => CURATED_TOOLS[tk] ?? []);
  const defs: OpenAITool[] = [];
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const t = await composioFetch(`/tools/${slug}`);
        const params = t?.input_parameters && typeof t.input_parameters === "object"
          ? t.input_parameters
          : { type: "object", properties: {} };
        // Composio injects the connected account itself — hide user_id from the model.
        if (params.properties && typeof params.properties === "object") {
          delete params.properties.user_id;
        }
        defs.push({
          type: "function",
          function: {
            name: slug,
            description: String(t?.description ?? t?.name ?? slug).slice(0, 400),
            parameters: params,
          },
        });
      } catch {
        /* skip a tool that fails to load */
      }
    }),
  );
  return defs;
}

/** Execute one Composio tool on behalf of the user. Returns a compact result. */
async function executeTool(userId: string, slug: string, args: any): Promise<any> {
  try {
    const res = await composioFetch(`/tools/execute/${slug}`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, arguments: args ?? {} }),
    });
    return res?.data ?? res;
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 300) };
  }
}

async function openaiChat(body: any): Promise<any | null> {
  const { url, key, model } = llm();
  if (!key) return null;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, ...body }),
  });
  if (!res.ok) {
    console.error("LLM tools error", res.status, await res.text());
    return null;
  }
  return res.json();
}

/**
 * Run an OpenAI chat that can call the user's connected Composio tools.
 * Returns the final assistant text (or null if OpenAI is unavailable).
 */
export async function chatWithComposio(
  userId: string,
  messages: any[],
  toolkitSlugs: string[],
  maxTurns = 4,
): Promise<string | null> {
  const tools = await toolDefsFor(toolkitSlugs);
  const convo = [...messages];
  for (let turn = 0; turn < maxTurns; turn++) {
    const data = await openaiChat(
      tools.length ? { messages: convo, tools, tool_choice: "auto", temperature: 0.4 } : { messages: convo, temperature: 0.4 },
    );
    const msg = data?.choices?.[0]?.message;
    if (!msg) return null;
    convo.push(msg);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) return String(msg.content ?? "");
    for (const tc of calls) {
      let args: any = {};
      try {
        args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        /* leave args empty */
      }
      const result = await executeTool(userId, tc.function?.name ?? "", args);
      convo.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result).slice(0, 4000),
      });
    }
  }
  // Out of turns — ask for a final answer with no more tool calls.
  const final = await openaiChat({ messages: convo, temperature: 0.4 });
  return String(final?.choices?.[0]?.message?.content ?? "");
}

export { CURATED_TOOLS };
