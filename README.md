# RoleCall AI

**Turn your best closers' instincts into live, voice-based training every rep can practice — grounded in real prospects.**

A senior salesperson is *interviewed by an AI* (by voice or text) about a deal; the AI auto-builds a roleplay **training module**; reps practice it on a **live voice call** against an AI buyer; **GPT-class models grade the call** against a rubric in seconds; managers get a reactive dashboard, a leaderboard, AI-drafted module suggestions, and a **"Hivemind"** they can literally talk to about their team's data.

The twist: scenarios aren't generic. Name a real business ("Mendocino Farms in Lafayette") or a segment ("large enterprises") and the buyer is built from the **real decision-maker** — pulled live from a 1.15B-profile B2B graph, with their actual LinkedIn — plus scraped reviews.

> Built in a weekend at the **Orange Slice AI Growth Hackathon**. Live: **https://rolecallai.vercel.app**

---

## Why this is technically deep

This is not a chatbot wrapper. It's a fully reactive, multi-modal, agentic application with several hard subsystems wired together:

- **Realtime voice roleplay** — live, low-latency conversations over **WebRTC** (ElevenLabs Conversational AI). The buyer is dynamically prompted per-module; the **voice is auto-matched to the buyer's gender**, and a **narrator speaks the scene** before the buyer opens. Hang-up waits for the buyer to finish their sentence so the audio never clips.
- **Sub-second inference everywhere** — all LLM work (call grading, module generation, the agentic chat, enrichment synthesis) runs on **Cerebras `gemma-4-31b`** (~0.6–1.7s vs 3–5s), with **OpenAI GPT-4o as an automatic fallback** behind one config flag. JSON-mode and tool-calling both verified on the fast path.
- **Agentic tool-calling over your real stack** — connect HubSpot / Salesforce / Gmail / Google Calendar etc. via **Composio managed OAuth** (no API keys to paste), then the assistant **calls those tools live** to answer questions ("what's my biggest HubSpot deal closing this month?") and to build roleplays from a real CRM prospect.
- **Real B2B data grounding** — **Orange Slice** (LinkedIn DB: 1.15B profiles / 85M companies) resolves a named business → its real decision-maker → their real LinkedIn URL, and scrapes reviews. The AI then reports its findings conversationally and grounds the buyer's personality + objections in real data. Graceful fallback to model knowledge when a lookup misses.
- **The Hivemind** — an agentic chat over the *entire* training dataset (every transcript, score, rubric, objective hit-rate) that can draft a course on the spot, **plus** a live "collective consciousness" visualization of what each AI agent (Grader / Buyer / Coach / Strategist) is thinking.
- **Voice-driven authoring** — the senior salesperson can **preview the buyer** (talk to it) straight from the editor and **adjust the scenario by talking** ("make her more skeptical about comp") — which revises the draft and **auto-reconnects** so the change is heard immediately.
- **Fully reactive backend** — the entire backend (DB, serverless functions, auth, cron-published scheduling) is **Convex**. Every dashboard, leaderboard, and transcript updates live via subscriptions; there is no REST layer to maintain.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind (light glassmorphism), Framer Motion |
| Backend | **Convex** — reactive DB, serverless functions, auth, cron, scheduler (no separate API) |
| Auth | Convex Auth (email/password + Google OAuth) |
| LLM | **Cerebras `gemma-4-31b`** (primary) → OpenAI GPT-4o (fallback) |
| Realtime voice | ElevenLabs Conversational AI (WebRTC) + voice catalog + browser SpeechSynthesis narrator |
| Integrations | **Composio** managed-OAuth + LLM tool-calling |
| B2B data | **Orange Slice** — LinkedIn graph + enrichment + review scraping (Apify), one key |
| Deploy | Convex Cloud + Vercel |

## How we built it this fast

Velocity was a feature, not an accident:

- **Convex erases the backend.** Schema, queries/mutations, auth, scheduling, and realtime subscriptions live in one typed codebase — no API plumbing, no websocket glue, no migrations dance. New feature = a new function + a query.
- **Cerebras erases LLM latency.** Sub-second responses mean the *build loop itself* is instant: generate a module, grade a call, revise a scenario — no waiting, so iteration is tight.
- **Everything is one provider-swap away.** LLM calls route through a single `llm()` resolver; each external capability (Composio, Orange Slice, ElevenLabs) sits behind one small action, so they compose instead of fighting.
- **Agent-assisted development** end-to-end — spec → implement → typecheck → deploy in tight cycles, with one-command Convex + Vercel deploys.

The commit history is the receipt: a prototype, then feature after feature — voice, grading, the Hivemind, integrations, the Cerebras swap, real-data grounding, voice authoring — landing at this final build.

## Run it

```bash
npm install
npx convex dev            # provisions a dev deployment, writes VITE_CONVEX_URL to .env.local
# set deployment secrets (see .env.example):
npx convex env set CEREBRAS_API_KEY ...
npx convex env set ELEVENLABS_API_KEY ...   # + ELEVENLABS_AGENT_ID
# Composio / Orange Slice keys are optional — features degrade gracefully without them
npm run dev               # http://localhost:5173
```

Sign up as a **manager** for a fully-seeded demo team; sign up as a **rep** (via an invite link) to practice.

## Sponsors

Built at the **Orange Slice AI Growth Hackathon**, using:

- **Orange Slice** — real B2B data: LinkedIn decision-maker lookup, enrichment, and review scraping (Apify) under one key.
- **Convex** — the entire reactive backend (also targeting *Best use of Convex*).
- **OpenAI** — fallback model + credits.
- **Cursor** — built with it.

(Cerebras, ElevenLabs, and Composio are tools we chose for inference, voice, and integrations — not event sponsors.)
