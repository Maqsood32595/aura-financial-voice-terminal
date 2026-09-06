# Aura · SEC EDGAR 10-K In-RAM Financial Voice Agent

A prototype conversational financial terminal designed to query audited SEC Form 10-K filings with sub-second response times and deterministic numerical accuracy.

---

## Overview

Traditional financial analysis workflows often require analysts to manually search, extract, and reconcile line items from multi-hundred-page annual reports. Conversational AI assistants can streamline this inquiry process, but standard ungrounded LLM generation poses risks of numerical hallucination.

**Aura** addresses this with a dual-layer architecture:
- **In-Memory Relational Engine**: Pre-loads structured SEC 10-K data into an in-memory WebAssembly PostgreSQL database (`PGlite`), executing queries in `<1ms` with zero disk I/O.
- **Low-Latency Streaming Voice**: Interfaces via AssemblyAI's real-time Voice Agent API (24kHz Linear PCM) with hardware-level resampling and voice activity turn detection.

---

## Key Capabilities

- **Deterministic Financial Ground Truth**: Revenue, gross margin %, net income, and free cash flow metrics are queried via relational SQL rather than estimated probabilistically.
- **Cross-Company Comparisons**: Handles multi-turn comparative queries across peer companies (e.g., comparing Walmart and Microsoft operating metrics).
- **Out-of-Band Audit Trail**: Automatically logs inquired metrics to an append-only audit trail (`financial_notepad.txt`) without blocking the main event loop.
- **Caller Voice Isolation**: Analyzes fundamental frequency ($F_0$) to maintain speaker focus during conversational turns.
- **Automated Verification**: Backed by a 5-suite PIET test suite verifying relational integrity, teardown invariants, and multi-turn session persistence.

---

## Technical Stack

- **Runtime**: Node.js (ES Modules)
- **Database**: In-Memory WebAssembly PostgreSQL (`@electric-sql/pglite`)
- **Voice / Speech**: AssemblyAI Universal-3.5 Voice Agent API (WebSocket, 24kHz Linear PCM streaming)
- **Reasoning**: Google Gemini API / Groq
- **Frontend**: Vanilla JavaScript, Web Audio API (real-time audio downsampling & visualization), CSS3

---

## Getting Started

### Prerequisites

- Node.js 18+ installed

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/aura-sec-voice-agent.git
   cd aura-sec-voice-agent
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Provide your API keys in `.env`:
   - `ASSEMBLYAI_API_KEY`
   - `ASSEMBLYAI_AGENT_ID`
   - `GEMINI_API_KEY`

4. Start the server:
   ```bash
   npm start
   ```

5. Open your browser at `http://localhost:5035`.

---

## Running Test Suites

Execute the in-memory verification test suites:

```bash
npm test
```

Verifies:
1. 6-gate falsification and negative lookups
2. Relational schema consistency across 585 SEC 10-K filings
3. Multi-turn deep memory retention
4. Ephemeral session teardown invariants

---

## Engineering Note

*This project is an exploratory technical prototype. Multi-turn context handling across diverse financial edge cases and voice activity detection thresholds under varying background acoustic environments require ongoing testing and refinement.*
