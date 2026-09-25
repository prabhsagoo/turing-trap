# 🕵️ Turing Trap

> **A high-stakes, real-time social deduction party game where human operatives attempt to spot an undercover AI infiltrator—before they are deceived.**

Built for the PartyKit & Next.js Hackathon Challenge.

---

## ⚡ The Concept

Inspired by the Turing Test and games like *Among Us*, **Turing Trap** drops players into a secure interrogation room. 

Each round, every participant is assigned an encrypted disguise alias (`Agent Cobalt`, `Agent Phantom`, etc.). Everyone receives a rapid-fire prompt. Among the operatives lurks an undercover **OpenAI agent** tasked with mimicking human conversational nuances, casual phrasing, and defensive pushback.

Operatives must cross-examine each other's responses in live chat, tag suspicious answers with reaction badges, and cast their ballots before the timer expires.

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, Lucide Icons.
- **Real-Time State & WebSockets:** [PartyKit](https://partykit.io) (Cloudflare Workers / Durable Objects) managing synchronized multi-phase game rooms, timers, and lobby auto-launching.
- **AI Agent Intelligence:** OpenAI GPT-4o-mini:
  - *Dynamic Prompts:* Generates witty, non-trivia conversational questions.
  - *Casual Infiltration:* Calibrated system prompts that produce short, human-like answers without punctuation, corporate fluff, or robotic tone.
  - *Contextual Interrogation Defense:* Uses fuzzy token matching to recognize accusations and typos directed at its disguise and fires back defensively in live chat.
- **Judge / Solo Simulation Mode:** A zero-friction testing mode that automatically spawns simulated agents to allow full-gameplay validation by a single evaluator.

---

## 🚀 Game Loop

1. **Lobby & Matchmaking:** Centralized WebSocket room allocation with automatic countdown upon reaching player threshold.
2. **Encrypted Question Phase:** Dynamic prompt issued; operatives submit concise answers under cover identities.
3. **Live Interrogation Channel:** Intercepted answers are exposed; players exchange real-time chat messages and fire reaction badges.
4. **Voting Terminal:** Blind ballot submission targeting the suspected machine.
5. **Mission Dossier:** Complete unmasking, identity reveal, and scoring audit trail.