import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Architecture",
  description:
    "How Sphynx is put together: a Claude-Code-native desk with no backend and no Python orchestrator, one main session, a folder of sub-agents, one MCP broker connection, a JSON snapshot instead of a database, and a separate on-chain module on Robinhood Chain mainnet that layers session scoping, custody-layer caps, and an append-only registry — unaudited, deposit-capped, no timelock yet.",
  eyebrow: "04, Architecture",
  blocks: [
    {
      type: "prose",
      md: "Sphynx's architecture is **Claude-Code-native**. There is **no backend server** and **no Python orchestrator**. The **Portfolio Manager (PM)** is not a separate process, it *is* the main Claude Code session you talk to. It orchestrates a small team of sub-agents, reaches the broker through a single [MCP](/docs/mcp) server, and writes its results to a plain JSON file. That's the whole system.",
    },
    {
      type: "prose",
      md: "The sub-agents are just **Markdown files** in `.claude/agents/`, loaded when Claude Code starts. The broker lives behind one connector, the `robinhood-trading` MCP server declared in `.mcp.json`. State is a snapshot file plus append-only logs, not a database. Everything you'd normally stand up as services, queues, an ORM, a job scheduler, a container, is deliberately absent. This page maps each piece to where it actually lives in the repo.",
    },
    {
      type: "heading",
      text: "Claude-Code-native by design",
    },
    {
      type: "prose",
      md: "The design goal is that nothing about the desk is aspirational plumbing. Every component is a file you can open and read: an agent is Markdown, a guardrail is a contract, a strategy is a note, state is JSON. Four architectural choices follow from that.",
    },
    {
      type: "cards",
      columns: 2,
      cards: [
        {
          title: "No backend server",
          badge: "NATIVE",
          md: "There is no FastAPI/Uvicorn process and no service to deploy. The PM is the live Claude Code session; orchestration happens inside it.",
        },
        {
          title: "No external orchestrator",
          badge: "NATIVE",
          md: "No LangGraph or LangChain. The PM fans out to sub-agents and routes their findings through the Risk Manager using Claude Code's own dispatch.",
        },
        {
          title: "One broker connection",
          badge: "MCP",
          md: "A single `robinhood-trading` MCP server (`.mcp.json`, HTTP transport) is the **only** path to the Agentic account. Auth is OAuth 2.0, in-session.",
        },
        {
          title: "One state snapshot",
          badge: "NO DB",
          md: "State is `ui/public/desk-state.json` plus append-only JSONL logs. No PostgreSQL, no Redis, the dashboard mirrors the snapshot.",
        },
      ],
    },
    {
      type: "callout",
      tone: "info",
      title: "The PM is the session, not a service",
      md: "When these docs say *\"the PM does X,\"* they mean the main Claude Code session does it. The PM is the **only** role that can place an order, and only after your explicit in-session approval. The specialist roles it dispatches are covered in [The Desk Team](/docs/team); the step-by-step run is in [The Desk Run](/docs/workflow).",
    },
    {
      type: "heading",
      text: "How a run flows through the system",
    },
    {
      type: "prose",
      md: "A single request travels from you, through the PM, out to the sub-agents and the broker (read-only), and back to a **preview card**. Steps 1–6 are research and produce **no order**, the desk stops at the preview and waits. The full lifecycle, with every tool call and gate, is documented in [The Desk Run](/docs/workflow).",
    },
    {
      type: "diagram",
      title: "One request, end to end (steps 1–6 place no order)",
      ascii: `YOU ──▶ PORTFOLIO MANAGER  (main Claude Code session · only role that can order)
   1. SENSE     ─▶ read portfolio + positions        (Agentic account, read-only)
   2. SCREEN    ─▶ Technical Analyst runs scans       ─▶ candidate shortlist
   3. RESEARCH  ─▶ Fundamental · Technical · Macro/News
                    (dispatched in parallel · read-only · news is injection-isolated)
   4. SYNTHESIZE─▶ propose one trade tied to a rule in strategies/
   5. RISK      ─▶ Risk Manager (opus) ─▶ APPROVE / CHANGES / VETO   (veto stops here)
   6. PREVIEW   ─▶ review_equity_order ─▶ build a preview card   ◀── steps 1-6: NO order
   7. APPROVAL  ─▶ present preview to YOU and wait                ◀── the desk stops here
   8. EXECUTE   ─▶ only on your "yes": place_equity_order  (still gated by the 'ask' rule)`,
    },
    {
      type: "note",
      md: "The desk's standard output is the preview card at step 7. It never proceeds to `place_equity_order` on its own, see [Guardrails](/docs/guardrails) for the permission gate.",
    },
    {
      type: "heading",
      text: "How the pieces are wired",
    },
    {
      type: "prose",
      md: "Everything hangs off the one session. The PM loads the sub-agents from a folder, reads its contract and permissions from two files, enforces written strategy rules, and emits a snapshot the dashboard polls. The broker sits behind a single MCP hop.",
    },
    {
      type: "arch3d",
      title: "The desk, mapped",
      caption: "Drag to rotate. The Portfolio Manager is the only role with order tools; everything else is read-only or advisory. The wiring in full is below.",
    },
    {
      type: "diagram",
      title: "Component wiring",
      ascii: `CLAUDE CODE  (host runtime)
  │
  └─ PORTFOLIO MANAGER  = main session · only role with order tools
        │
        ├─ .claude/agents/*.md ──▶ 3 analysts (sonnet) + Risk Manager (opus)
        │                          least-privilege · loaded at startup · no order tools
        │
        ├─ robinhood-trading MCP ──HTTP──▶ https://agent.robinhood.com/mcp/trading
        │                          OAuth 2.0, in-session · Agentic account only
        │
        ├─ CLAUDE.md + .claude/settings.json ──▶ operating contract + deny→ask→allow gate
        │
        ├─ strategies/*.md ──▶ written caps + entry/exit rules (Risk Manager enforces)
        │
        ├─ writes ──▶ ui/public/desk-state.json ──▶ ui/ dashboard (Vite+React, read-only)
        │                                            polls the snapshot every ~5s
        │
        └─ appends ──▶ logs/*.jsonl  (via tools/desk-log.mjs · append-only audit trail)`,
    },
    {
      type: "heading",
      text: "Main components",
    },
    {
      type: "prose",
      md: "Every component below is a real path in the repo. Nothing here is a running service you have to manage, they are files the session reads, writes, or dispatches.",
    },
    {
      type: "table",
      caption: "Faithful to design.md §3.2, each row is a real location in the repo.",
      headers: ["Component", "Technology / location", "Function"],
      rows: [
        [
          "Portfolio Manager (orchestrator)",
          "main Claude Code session",
          "Reads the account, dispatches sub-agents in parallel, synthesizes a proposal, presents a preview, and, after your approval, places the order. The **only** role that can order.",
        ],
        [
          "Sub-agents (analysts + risk)",
          "`.claude/agents/*.md`",
          "Four least-privilege specialist roles, loaded when Claude Code **starts**. None of them hold order tools. See [The Desk Team](/docs/team).",
        ],
        [
          "Broker connector",
          "`robinhood-trading` MCP · `.mcp.json` (HTTP)",
          "The single path to the Robinhood Agentic account; authenticates via OAuth in-session. See [MCP & the broker](/docs/mcp).",
        ],
        [
          "Guardrails & permissions",
          "`CLAUDE.md` + `.claude/settings.json`",
          "The PM's operating contract plus a `deny → ask → allow` permission gate (orders gated, options denied, reads allowed). See [Guardrails](/docs/guardrails).",
        ],
        [
          "Strategies & risk rules",
          "`strategies/*.md`",
          "Written caps and entry/exit rules the Risk Manager reads and enforces. See [Strategies](/docs/strategies).",
        ],
        [
          "Dashboard (read-only)",
          "`ui/`, Vite + React, `type: module`",
          "Mirrors `desk-state.json`; it **cannot** place orders. See [Dashboard](/docs/dashboard).",
        ],
        [
          "Backtester (offline)",
          "`backtest/`, Node ESM, no dependency",
          "Sanity-checks strategy logic against historical bars with plain `node`, no `npm install`. See [Backtesting](/docs/backtesting).",
        ],
        [
          "Audit log (JSONL)",
          "`logs/` + `tools/desk-log.mjs`",
          "Append-only structured trail of desk runs, verdicts, previews, approvals, fills, and injection alerts. See [Logging](/docs/logging).",
        ],
        [
          "Documentation",
          "`docs/` (TEAM, SETUP, TRIGGER, LOGGING)",
          "Team roles, OAuth setup, the optional \"Run desk\" trigger, and the logging schema.",
        ],
      ],
    },
    {
      type: "heading",
      text: "The broker connection",
    },
    {
      type: "prose",
      md: "There is exactly one way for the desk to touch the market: the `robinhood-trading` MCP server. It is declared project-scoped in `.mcp.json` with an HTTP transport pointed at Robinhood's Agentic endpoint. Nothing else in the repo talks to the broker.",
    },
    {
      type: "code",
      lang: "json",
      filename: ".mcp.json",
      code: `{
  "mcpServers": {
    "robinhood-trading": {
      "type": "http",
      "url": "https://agent.robinhood.com/mcp/trading"
    }
  }
}`,
    },
    {
      type: "list",
      items: [
        "**Transport:** HTTP, the connector is a remote MCP endpoint, not a local process.",
        "**Auth:** OAuth 2.0, completed **in-session** (desktop + mobile verify). No token lives in the repo.",
        "**Reach:** the Agentic account only. Other Robinhood accounts are read-only context; nothing outside Agentic is ever traded.",
        "**Order tools live only on the PM.** `review_equity_order` and `place_equity_order` are held by the main session, never by a sub-agent. Full tool map in [MCP & the broker](/docs/mcp).",
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "Least-privilege is structural",
      md: "The three analysts and the Risk Manager **physically have no order tools** in their `tools:` frontmatter. Even a fully compromised analyst cannot place a trade, only the PM can, and only behind the `ask` permission rule. This is enforced by the sub-agent definitions in `.claude/agents/`, not by convention. See [Guardrails](/docs/guardrails) and [Prompt-injection defense](/docs/prompt-injection).",
    },
    {
      type: "heading",
      text: "State without a database",
    },
    {
      type: "prose",
      md: "Sphynx keeps no database. Its entire state is two kinds of file: a single **snapshot** the PM overwrites after each run, and an **append-only log** of what happened. That's enough to drive a live dashboard and a full audit trail without a server.",
    },
    {
      type: "deflist",
      items: [
        {
          term: "Current state, the snapshot",
          md: "`ui/public/desk-state.json` holds the latest account view, positions, candidate verdicts, the proposed trade/preview, recent orders, and any injection alerts. The PM overwrites it after every run; the real file is gitignored and only `*.example.*` is committed. Schema lives in [`ui/README.md`](/docs/dashboard).",
        },
        {
          term: "History, the logs",
          md: "Append-only JSONL under `logs/`, written via `tools/desk-log.mjs`. One JSON object per line captures desk runs, analyst and risk verdicts, previews, approvals, fills, and injection alerts. See [Logging](/docs/logging).",
        },
        {
          term: "Scheduling",
          md: "There is no Celery/Redis job queue. Recurring runs use `/loop` or a Claude-session cron, the session is the scheduler.",
        },
      ],
    },
    {
      type: "diagram",
      title: "Data flow: snapshot → dashboard",
      ascii: `PORTFOLIO MANAGER ──runs the desk, writes──▶ ui/public/desk-state.json
   (Claude Code session)                        (gitignored: real account state)
                                                       │
                                                       │  polled every ~5s (cache-busted)
                                                       ▼
                                              ui/ dashboard (Vite + React, read-only)
                                              falls back to desk-state.example.json
                                              when no live snapshot exists`,
    },
    {
      type: "note",
      md: "The dashboard is a **mirror, not a controller**, approval and execution happen only in the Claude Code session. See [Dashboard](/docs/dashboard).",
    },
    {
      type: "heading",
      text: "Technology stack (the real one)",
    },
    {
      type: "prose",
      md: "The running stack is small and unglamorous on purpose. Here is exactly what is in play, layer by layer.",
    },
    {
      type: "deflist",
      items: [
        {
          term: "Host runtime",
          md: "Claude Code, the main session acts as the Portfolio Manager.",
        },
        {
          term: "Sub-agents",
          md: "Markdown files in `.claude/agents/` with `tools:` / `model:` frontmatter that defines each role's least-privilege tool set and model.",
        },
        {
          term: "Broker",
          md: "The `robinhood-trading` MCP server over HTTP (`.mcp.json`), authenticated with OAuth 2.0 in-session.",
        },
        {
          term: "Models",
          md: "Claude, the three analysts run on **sonnet**; the Risk Manager runs on **opus**.",
        },
        {
          term: "Dashboard",
          md: "Vite + React in `ui/`, ES modules (`\"type\": \"module\"`), strictly read-only.",
        },
        {
          term: "Offline tooling",
          md: "The backtester (`backtest/`) and the logger (`tools/desk-log.mjs`) are **pure Node, ESM, with no dependencies**, they run with plain `node`, no `npm install`.",
        },
        {
          term: "UI format helpers",
          md: "`ui/src/format.js` provides `usd`, `pct`, `num`, `signClass`, and `timeAgo` for rendering.",
        },
      ],
    },
    {
      type: "pills",
      items: [
        "Claude Code",
        "MCP over HTTP",
        "OAuth 2.0",
        "Markdown sub-agents",
        "sonnet analysts",
        "opus risk",
        "Vite + React",
        "Node ESM · no deps",
        "JSON snapshot · no DB",
        "Read-only dashboard",
      ],
    },
    {
      type: "heading",
      text: "What Sphynx deliberately does not use",
    },
    {
      type: "prose",
      md: "An earlier v1.0 design draft imagined a much heavier system. None of it ships. This matters for reading the code: if you expect a server, a queue, or a wallet, you will look for files that do not exist. The table below maps each assumed component to its real status.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "Don't assume the aspirational v1.0 components exist",
      md: "The running system on this page is the equities desk, its **trading path** has no chain, RPC, wallet, or token code; every order goes through the Robinhood MCP. The on-chain layer is a **separate module** in `onchain/` (an ERC-4626 vault + guardrails-as-code + on-chain attestations). It is **deployed to Robinhood Chain mainnet** as of 2026-09-20, and it is still **unaudited, deposit-capped, holds zero assets, and is not part of the live desk.** It is mapped in full further down this page; see the [Safety & Disclaimer](/docs/disclaimer) for scope.",
    },
    {
      type: "table",
      caption: "Faithful to design.md §5.3, components removed from the aspirational v1.0 draft.",
      headers: ["Assumed component", "Reality in the running system"],
      rows: [
        ["Python backend (FastAPI / Uvicorn)", "**None.** The PM is the Claude Code session; there is no server process to deploy."],
        ["LangGraph / LangChain orchestrator", "**None.** Orchestration is native to Claude Code."],
        ["Celery / Redis job queue", "**None.** Scheduling uses `/loop` or a Claude-session cron."],
        ["PostgreSQL / any database", "**None.** State is `desk-state.json` plus append-only JSONL logs."],
        ["Docker / Docker Compose", "**None.** It runs as local files and plain `node`."],
        ["Blockchain / RPC / wallet / token", "**Not in the running desk.** A separate module lives in `onchain/` (ERC-4626 vault + guardrails-as-code + attestations). It is now deployed to Robinhood Chain mainnet (chainId 4663), still unaudited and deposit-capped, and it is **not** in the equities trading path. The `$SPHYNX` token is **not built**."],
      ],
    },
    {
      type: "compare",
      left: {
        title: "What a heavier draft assumed",
        tone: "bad",
        rows: [
          "A backend service to deploy and monitor",
          "An orchestration framework to wire agents",
          "A queue and a database to hold state",
          "Containers to reproduce the environment",
        ],
      },
      right: {
        title: "What Sphynx actually is",
        tone: "good",
        rows: [
          "One Claude Code session as the PM",
          "Sub-agents as Markdown files",
          "A JSON snapshot + append-only JSONL",
          "Plain `node` and a Vite dashboard",
        ],
      },
    },
    {
      type: "divider",
    },
    {
      type: "heading",
      text: "The separate on-chain module",
    },
    {
      type: "prose",
      md: "Everything above is the equities desk. The `onchain/` module is a **different system** with a different trust model: a Foundry project where the risk caps written in `strategies/` are enforced by a contract instead of read by an agent. **Enforced, not promised.** As of **2026-09-20** it is deployed to **Robinhood Chain mainnet, chainId 4663**, against real USDG and the real Uniswap V3 stock-token pools.",
    },
    {
      type: "prose",
      md: "It is wired to the desk in **neither** direction: the desk's orders go through the Robinhood MCP and never touch a chain, and the vault's orders go through a Uniswap V3 pool and never touch a brokerage. Every desk order still needs your explicit in-session approval.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Mainnet, unaudited, no timelock, deposits capped",
      md: "No third-party audit. Owner changes land in one transaction. One EOA is owner and session holder at launch. Deposits are capped at **10,000 USDG**, NAV is **0**, and there are **no depositors, no trades, no returns, and no track record**. Read [Risks](/docs/risks) before depositing.",
    },
    {
      type: "cards",
      columns: 3,
      cards: [
        { title: "Trading Guide", badge: "USE", md: "Connect, fund, compose an order, read the vault's verdict, sign. [Open](/docs/trading)" },
        { title: "The Vault", badge: "CUSTODY", md: "ERC-4626 over USDG; `previewTrade()` names the rule an order would break; exits that always work. [Open](/docs/vault)" },
        { title: "Session Keys", badge: "AUTHZ", md: "Expiring, budgeted, ticker-scoped sessions; a refusal spends nothing. [Open](/docs/session-keys)" },
        { title: "Oracle & Execution", badge: "PRICE", md: "5-minute Uniswap V3 TWAP with a deviation bound; typed adapter, no router. [Open](/docs/oracle)" },
        { title: "Contracts", badge: "REF", md: "Addresses, ABIs, build and deploy. [Open](/docs/contracts)" },
        { title: "Risks", badge: "READ FIRST", md: "What can go wrong, ranked, with what limits it today. [Open](/docs/risks)" },
      ],
    },
    {
      type: "diagram",
      title: "Three layers of least privilege",
      ascii: `AGENT KEY ──execute(trade)──▶ SessionKeyExecutor   expiry · per-trade · budget · count · side · ticker
                                     │
                                     ▼
                              RWAVault (vSPHYNX)    previewTrade() == None or revert GuardrailBreach(rule)
                                     │              caps from GuardrailConfig · owner-changeable within hard ceilings
                                     ▼
                              UniswapV3Adapter      one registered USDG pool per token · no router · minAmountOut
                                     │
                              Uniswap V3 pool       also the price source: 5m TWAP, 3% spot-deviation bound

DeskRegistry                  append-only attestations · refusals and vetoes go on the record`,
    },
    {
      type: "table",
      caption: "Robinhood Chain mainnet, chainId 4663, block 26,015,235. Mirrors onchain/deployments/latest.json.",
      headers: ["Contract", "Address"],
      rows: [
        ["RWAVault (vSPHYNX)", "`0x510Af4fC7fA571e5549258541a9374dE3D894F28`"],
        ["SessionKeyExecutor", "`0x87a6F83D1375401e1BfFca9e8055228033788713`"],
        ["GuardrailConfig", "`0x7Ec7A870361E75A44E5549b57Cd437742e509be2`"],
        ["UniswapV3Oracle", "`0xBf4fbd55eB70DC6424d839B9F6fDbc693A63cCe5`"],
        ["UniswapV3Adapter", "`0x18bdc0EE9C2d33eeAbC5fe422126310cf3df13bC`"],
        ["DeskRegistry", "`0x685915EB0226757bFeae58c5f5BdD3f5F493Eac4`"],
      ],
    },
    {
      type: "divider",
    },
    {
      type: "callout",
      tone: "info",
      title: "Where to go next",
      md: "Meet the roles the PM dispatches in [The Desk Team](/docs/team), follow a run end to end in [The Desk Run](/docs/workflow), see the broker tool map in [MCP & the broker](/docs/mcp), or open the read-only mirror in [Dashboard](/docs/dashboard).",
    },
  ],
};
