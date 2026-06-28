"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

type CompanyEnrichment = {
  summary: string;
  industry?: string;
  size?: string;
  website?: string;
  source: string;
};

async function openaiJSON(messages: any[]): Promise<any | null> {
  // Prefer Cerebras (near-instant) when configured; fall back to OpenAI.
  const cerebras = process.env.CEREBRAS_API_KEY;
  const key = cerebras || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const url = cerebras ? "https://api.cerebras.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
  const model = cerebras ? "gemma-4-31b" : "gpt-4o";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.3, max_tokens: 4000, response_format: { type: "json_object" }, messages }),
    });
    if (!res.ok) return null;
    return JSON.parse((await res.json())?.choices?.[0]?.message?.content);
  } catch {
    return null;
  }
}

/** Resolve `p`, but never wait longer than `ms` (returns null on timeout). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Best-effort Orange Slice (Fiber) firmographic lookup. Hard-capped so it can never hang. */
async function orangeSlice(company: string, domain?: string): Promise<CompanyEnrichment | null> {
  const key = process.env.FIBER_API_KEY;
  if (!key) return null;
  const attempt = (async (): Promise<CompanyEnrichment | null> => {
    try {
      const res = await fetch("https://api.orangeslice.ai/v1/enrich/company", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ name: company, domain }),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return {
        summary: d.description ?? d.summary ?? `${company}`,
        industry: d.industry,
        size: d.employee_range ?? d.size,
        website: d.website ?? d.domain,
        source: "Orange Slice",
      };
    } catch {
      return null;
    }
  })();
  return withTimeout(attempt, 3500);
}

type DecisionMaker = { personName: string; title: string; linkedinUrl: string; companyLinkedinUrl: string };

/**
 * Pull the REAL decision-maker (+ their LinkedIn profile) for a business via the
 * Orange Slice package (B2B LinkedIn DB: 1.15B profiles / 85M companies).
 * Gated on ORANGESLICE_API_KEY; hard-capped so it never hangs the call.
 */
async function orangeSliceDecisionMaker(name: string, timeoutMs = 12000): Promise<DecisionMaker | null> {
  const key = process.env.ORANGESLICE_API_KEY;
  if (!key) return null;
  const attempt = (async (): Promise<DecisionMaker | null> => {
    try {
      const mod: any = await import("orangeslice");
      const os: any = typeof mod?.services === "object" ? mod : (mod?.default ?? mod);
      // The package reads ORANGESLICE_API_KEY from env (Convex provides it) — its
      // configure({apiKey}) path is unreliable, so we rely on the env var.
      const companyUrl: string | null = await os.services.company.linkedin.findUrl({ companyName: name });
      if (!companyUrl) return null;
      const emp: any = await os.services.company.getEmployeesFromLinkedin({
        linkedinUrl: companyUrl,
        titleVariations: ["CEO", "Founder", "Co-Founder", "Owner", "President", "Managing Director", "General Manager", "VP Sales", "Head of Sales"],
        limit: 5,
      });
      const list: any[] = emp?.employees ?? emp?.results ?? emp?.rows ?? (Array.isArray(emp) ? emp : []);
      const p = list[0];
      if (!p) return { personName: "", title: "", linkedinUrl: "", companyLinkedinUrl: companyUrl };
      const personName = String(p.lp_formatted_name ?? `${p.lp_first_name ?? ""} ${p.lp_last_name ?? ""}`).trim();
      const title = String(p.lp_title ?? "");
      let linkedinUrl = String(p.lp_linkedin_url ?? p.linkedin_url ?? p.lp_url ?? p.url ?? p.lp_public_url ?? "");
      if (!linkedinUrl && personName) {
        linkedinUrl = String((await os.services.person.linkedin.findUrl({ name: personName, title })) ?? "");
      }
      return { personName, title, linkedinUrl, companyLinkedinUrl: companyUrl };
    } catch (e) {
      console.error("orangeslice lookup error", e);
      return null;
    }
  })();
  return withTimeout(attempt, timeoutMs);
}

export const enrichCompany = action({
  args: { company: v.string(), domain: v.optional(v.string()) },
  handler: async (_ctx, { company, domain }): Promise<CompanyEnrichment> => {
    const fromOS = await orangeSlice(company, domain);
    if (fromOS) return fromOS;

    const gpt = await openaiJSON([
      {
        role: "system",
        content:
          "Return ONLY JSON about a company for a sales-training tool: " +
          "{summary: 1-2 sentences on what they sell and to whom, industry, size (employee range guess), website (best-guess domain)}. " +
          "If unsure, give your best general knowledge — never refuse.",
      },
      { role: "user", content: `Company: ${company}${domain ? ` (domain ${domain})` : ""}` },
    ]);
    if (gpt) {
      return {
        summary: String(gpt.summary ?? `${company} — a sales organization.`),
        industry: gpt.industry ? String(gpt.industry) : undefined,
        size: gpt.size ? String(gpt.size) : undefined,
        website: gpt.website ? String(gpt.website) : domain,
        source: "AI",
      };
    }
    return { summary: `${company}`, website: domain, source: "manual" };
  },
});

/** Apify rag-web-browser: `query` may be a URL or a web search (e.g. "Joe's Diner reviews"). */
async function scrapeText(query: string, maxResults = 1, timeoutMs = 18000): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return "";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(
      `https://api.apify.com/v2/acts/apify~rag-web-browser/run-sync-get-dataset-items?token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, maxResults, outputFormats: ["markdown"] }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(t);
    if (!res.ok) return "";
    const items = await res.json();
    if (!Array.isArray(items)) return "";
    return items
      .map((i) => i?.markdown ?? i?.text ?? i?.metadata?.description ?? "")
      .join("\n\n")
      .slice(0, 6000);
  } catch {
    return "";
  }
}

/** Scrape a public URL via Apify → text used to build a persona/module. */
export const scrapeFootprint = action({
  args: { url: v.string() },
  handler: async (_ctx, { url }): Promise<{ text: string; source: string }> => {
    const text = await scrapeText(url);
    return { text, source: text ? "Apify" : "none" };
  },
});

/**
 * Enrich a REAL place/business the rep is selling TO (e.g. a named restaurant):
 * Orange Slice firmographics + scraped customer reviews → a grounded buyer profile
 * (likely owner/GM name, personality, and objections drawn from real review themes).
 */
type PlaceResult = {
  found: boolean;
  profile: string; // grounding block for module generation
  note: string; // first-person research line the coach can say in the interview
  link: string; // a profile link for the decision-maker
  personName: string;
  company: string;
};

export const enrichPlace = action({
  // `fast` skips the (slow) web scrape — used mid-interview so the coach can react
  // quickly from the model's knowledge; full mode (with scrape) runs at generation.
  args: { name: v.string(), fast: v.optional(v.boolean()) },
  handler: async (_ctx, { name, fast }): Promise<PlaceResult> => {
    // REAL decision-maker via Orange Slice (LinkedIn DB) + a web pull for reviews.
    // Tighter Orange Slice cap mid-interview so the coach stays snappy.
    const [dm, web] = await Promise.all([
      orangeSliceDecisionMaker(name, fast ? 7000 : 16000),
      fast ? Promise.resolve("") : scrapeText(`${name} reviews`, 3, 16000),
    ]);

    const verified = dm && dm.personName
      ? `VERIFIED via Orange Slice — decision-maker: ${dm.personName}${dm.title ? `, ${dm.title}` : ""}${dm.linkedinUrl ? ` — ${dm.linkedinUrl}` : ""}.`
      : "";

    const gpt = await openaiJSON([
      {
        role: "system",
        content:
          "You are a sales-research assistant. Research a REAL business so a sales rep can roleplay selling TO it. " +
          "If a VERIFIED decision-maker is provided below, you MUST use that exact real person (their name and title) — do not invent another. Otherwise identify the most likely decision-maker (founder/owner/GM/exec) from your own knowledge of this real, named business. " +
          "If web data is provided, ground in it; otherwise use your own knowledge. " +
          "Return ONLY JSON: {personName, role, company (the real business name), gender ('male'|'female'|'neutral' — best guess for the decision-maker), personality (2-3 sentences, 2nd person), objections (3 short realistic pushback lines), reviewThemes (1 sentence on the business's reputation), note (1-2 sentences in FIRST PERSON reporting your findings to the sales manager — e.g. \"I looked up Mendocino Farms via Orange Slice — it's run by Mario Del Pero, who comes across as brand-obsessed and confident. I'll base the buyer on him.\")}. " +
          "Always use the REAL business name. Never refuse.",
      },
      {
        role: "user",
        content: `BUSINESS: ${name}\n\n${verified || "(no verified decision-maker — use your own knowledge)"}\n\nWEB:\n${web || "(none found — use your own knowledge)"}`,
      },
    ]);

    if (!gpt) return { found: false, profile: "", note: "", link: "", personName: "", company: name };
    // Prefer the VERIFIED person + real LinkedIn URL; fall back to the model + a search link.
    const personName = (dm?.personName || String(gpt.personName ?? "")).trim();
    const company = String(gpt.company ?? name).trim();
    const link =
      dm?.linkedinUrl ||
      (personName ? `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${personName} ${company}`)}` : "");
    const verifiedTag = dm?.personName ? " (verified · Orange Slice)" : "";
    const profile = [
      `Real business: ${company}`,
      personName ? `Decision-maker: ${personName}${dm?.title ? `, ${dm.title}` : gpt.role ? `, ${gpt.role}` : ""}${verifiedTag}` : "",
      gpt.personality ? `Personality: ${gpt.personality}` : "",
      Array.isArray(gpt.objections) && gpt.objections.length
        ? `Likely objections: ${gpt.objections.map((o: any) => `"${String(o)}"`).join("; ")}`
        : "",
      gpt.reviewThemes ? `Reputation: ${gpt.reviewThemes}` : "",
      gpt.gender ? `Buyer gender: ${gpt.gender}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return { found: true, profile, note: String(gpt.note ?? ""), link, personName, company };
  },
});
