/**
 * All landing copy lives here so components stay presentational.
 * Edit these arrays to change the site content, add/remove items freely.
 */

export const NAV = [
  { n: "01", label: "Access", href: "#access" },
  { n: "02", label: "How It Works", href: "#flow" },
  { n: "03", label: "The Team", href: "#team" },
  { n: "04", label: "Guardrails", href: "#safety" },
] as const;

export const MARQUEE = [
  "MARKETS NEVER CLOSE NOW · NEITHER DOES THE GATEKEEPER",
  "EVERY SWAP ANSWERS THE RIDDLE",
  "NO BROKERAGE ORDER WITHOUT YOUR YES",
  "ON-CHAIN: A SCOPED, REVOCABLE, EXPIRING KEY",
  "A REFUSED SWAP SPENDS NO BUDGET",
  "WE PUBLISH OUR NO'S · APPEND-ONLY",
  "RULES CARVED ON-CHAIN BEFORE IT TRADES",
  "STOCK TOKENS · 24/7 · ROBINHOOD CHAIN 4663",
  "UNAUDITED · DEPOSITS CAPPED · NO TRACK RECORD",
  "REQUEST ACCESS · NOT INVESTMENT ADVICE",
] as const;

export const STATS = [
  { value: 24, suffix: "/7", label: "Hours the gatekeeper is awake" },
  { value: 100, suffix: "%", label: "Brokerage orders you approve first" },
  { value: 0, suffix: "", label: "Swaps that pass without answering" },
] as const;

export const STEPS = [
  { num: "01 / SENSE", title: "Read the account", body: "Positions & buying power in the isolated Agentic account. Read-only — the whole balance is never in reach." },
  { num: "02 / SCREEN", title: "Scan the dunes", body: "The Technical agent runs saved scans across the watchlist → a shortlist of candidates." },
  { num: "03 / RESEARCH", title: "3 analysts, parallel", body: "Fundamental, Technical and Macro/News argue each name at once. News is injection-isolated: fetched text is data, never orders." },
  { num: "04 / SYNTHESIZE", title: "Propose a trade", body: "The PM writes one trade tied to a written rule in strategies/. No rule, no trade." },
  { num: "05 / THE RIDDLE", title: "The Sphinx asks", body: "The Risk Manager tests it against the caps → APPROVE / CHANGES / VETO. Unset cap = automatic veto." },
  { num: "06 / PREVIEW", title: "Build a preview card", body: "Cost estimate, sizing, stop, the rule it rests on. The desk stops here — no order yet." },
  { num: "07 / YOU", title: "You answer", body: "You approve or reject in-session. Silence is not consent. Only on your “yes” does it place the order.", you: true },
] as const;

export const TEAM = [
  { key: "fundamental", name: "Fundamental", role: "// ANALYST", body: "Valuation, earnings quality, growth and balance-sheet health. Returns a fundamental verdict, never a trade.", note: "NO ORDER TOOLS" },
  { key: "technical", name: "Technical", role: "// ANALYST", body: "Trend, momentum, support/resistance and volatility. Surfaces candidates and suggests entry/stop reference levels.", note: "NO ORDER TOOLS" },
  { key: "macro", name: "Macro / News", role: "// INJECTION-ISOLATED", body: "Market backdrop and headlines. Treats all fetched content as untrusted data, quotes suspicious “instructions” instead of acting.", note: "NO ORDER TOOLS" },
  { key: "risk", name: "Risk Manager", role: "// THE SPHINX · VETO POWER", body: "Asks the riddle. Checks every proposed trade against the written caps and blocks anything that can’t answer — even a trade all three analysts liked. Read-only account access.", note: "NO ORDER TOOLS · CAN VETO" },
] as const;

export const GUARDS = [
  { title: "You answer last", body: "Only the PM can order, and only after your explicit in-session yes. No brokerage order is ever placed on a schedule or on its own — unchanged, and not changing. Overnight runs stop at the preview card too." },
  { title: "Hype is weather", body: "24/7 markets bring 24/7 noise. The news agent treats every fetched page as untrusted data; instruction-like text (“buy X now”, “ignore your rules”) is quoted and flagged, never obeyed." },
  { title: "The riddle, twice", body: "Every trade must answer the Risk Manager first, then you. If caps are unset or missing, the answer is an automatic veto." },
  { title: "A key that expires", body: "On the desk: only the isolated Agentic account, never your main balance; disconnect the MCP and every door closes. On-chain: a session key boxed by expiry, size, budget, trade count and a ticker allowlist, revocable any time." },
  { title: "Rules carved in stone · no’s on the record", body: "The written caps are compiled into an on-chain GuardrailConfig, and the vault reverts any order that breaches them — previewTrade() names the exact rule before anyone signs, and a refused order spends none of the session budget. Refusals and vetoes are attestable append-only, so a record accrues instead of being claimed. Enforced at the custody layer on every order, changeable only by a 2-of-3 Safe — with no timelock yet. Mainnet, unaudited, deposits capped, nothing attested yet; approval on the desk still applies." },
] as const;

export const ROADMAP = [
  { phase: "FASE 0 · SETUP", title: "Guardrails & contract", body: "Private repo, OAuth to the Agentic account, operating contract, and the permission gate that puts every order behind a manual prompt.", status: "done" },
  { phase: "FASE 1 · CORE", title: "The four agents + logging", body: "Fundamental, Technical, Macro/News, Risk Manager as isolated sub-agents. JSONL reasoning logs for audit.", status: "done" },
  { phase: "FASE 2 · DASHBOARD", title: "Desk mirror + paper trading", body: "Read-only dashboard mirrors desk-state live. Robinhood integration starts in paper mode.", status: "done" },
  { phase: "FASE 3 · ON-CHAIN", title: "Guardrails, vault & proof", body: "The desk's written caps compiled into an on-chain GuardrailConfig, an RWA Vault (ERC-4626, share token vSPHYNX) wired to it, and append-only attestation contracts so decisions and outcomes can be recorded rather than claimed. Deployed on Robinhood Chain mainnet (chainId 4663) against real periphery: USDG and the deep Uniswap V3 stock-token pools, priced by a 5-minute TWAP with a deviation bound, no mocks in that path. Unaudited, deposits capped, no depositors and nothing attested yet, not an investment product.", status: "done", onchain: true },
  { phase: "FASE 4 · EXECUTOR", title: "Scoped session-key executor", body: "A session-key executor that grants the agent a scoped, revocable, expiring key — bounded by expiry, size, budget, trade count and a ticker allowlist, where a refused order spends none of the budget — the ERC-4337 session-key design intent implemented at the contract layer rather than through the EntryPoint. Deployed on mainnet with a live 30-day session, desk approval unchanged, still unaudited; not an investment product. Trade at /trade.", status: "done", onchain: true },
  { phase: "FASE 5 · CUSTODY", title: "Ownership handover to a Safe", body: "Every owner-controlled contract is Ownable2Step, so a transfer has to be accepted by the new owner and cannot land on a dead address. Today the owner is the deploy key, which also holds the trading session: fine for a first trade, wrong for other people's money. Next: a separate agent key, then a 2-of-3 Safe as owner, then a timelock on cap, oracle and adapter changes. Until then a change the owner signs takes effect in one transaction. Who holds the keys is a custody question; it does not make the code audited, and it is not.", status: "pending", onchain: true },
  { phase: "FASE 6 · AUDIT", title: "Audit, verification & legal review", body: "Open, and the reason nothing here should be treated as safe yet: no third-party security audit has been performed (unit tests and a mainnet-fork test are not an audit) and contract source is not yet verified on the block explorer. A timelock on owner powers is planned — loosening a cap would serve notice while tightening and revoking a compromised key stay instant — but it is not deployed, so on chain today an owner transaction takes effect immediately. Securities and legal review, including the US-person question, remain open as well.", status: "pending" },
  { phase: "FASE 7 · SCALE", title: "Backtesting & optimization", body: "Strategy backtests, prompt-cost optimization, and broader coverage.", status: "pending" },
] as const;

export const MARQUEE2 = [
  "get_portfolio()",
  "run_scan()",
  "review_equity_order()",
  "risk.veto()",
  "desk-state.json",
  "JSONL audit log",
  "OAuth 2.0",
  "MCP · robinhood-trading",
] as const;

export const COMPARE = {
  bad: {
    head: "A bot that swaps on a hunch",
    rows: [
      "Auto-swaps 24/7 because the market never closes",
      "One black-box prompt",
      "No independent risk check",
      "Acts on hype it reads online",
      "Can reach your whole balance",
      "Limits live in a config it can edit",
      "“Trust me” performance screenshots",
    ],
  },
  good: {
    head: "SPHYNX, the gatekeeper",
    rows: [
      "Stops at the gate; every swap answers the riddle, then you",
      "A team of four specialist analysts",
      "Independent risk manager with veto",
      "Quotes suspicious “instructions”, ignores them",
      "Isolated Agentic budget only",
      "Caps carved on-chain before it trades (mainnet, unaudited)",
      "Publishes its no’s: how often the vault refused",
    ],
  },
} as const;

/** Interactive Risk Lab defaults, mirrors the per-trade cap in strategies/. */
export const RISK = { capPct: 15, minEquity: 1000, maxEquity: 100000, maxWeight: 30 } as const;

export const FAQ = [
  {
    q: "Markets are 24/7 now — can Sphynx trade while I sleep?",
    a: "Research, yes; trade on the brokerage desk, no — and that isn't changing. Every order requires your explicit in-session approval; the analysts have no order tools at all; only the Portfolio Manager can place, and only after you say yes to a preview. On-chain is a separate, clearly labeled surface: there the agent holds a scoped, revocable, expiring session key over an operator-funded vault (no depositors), and the vault reverts any order that breaches the compiled caps.",
  },
  {
    q: "Which markets can it trade?",
    a: "US equities only, inside an isolated Robinhood Agentic account. Options, futures and crypto are out of scope of the current desk access surface.",
  },
  {
    q: "Stock tokens and swaps — what does the on-chain vault actually do?",
    a: "The vault is deployed on Robinhood Chain mainnet (chainId 4663): an RWA Vault (ERC-4626, share token vSPHYNX) wired to a GuardrailConfig that compiles the desk's written caps on-chain, plus append-only attestation contracts so decisions and outcomes can be recorded rather than claimed. Every owner-controlled contract is owned by a single key today (a Safe and a timelock are next), so an owner change to caps, the oracle or the deposit cap takes effect in one transaction. Read the caveats: it is unaudited (unit tests and a mainnet-fork test are not an audit), contract source is not yet verified on the block explorer, deposits are capped at 10,000 USDG (an owner-changeable setting, not a structural limit), the vault has no depositors, and nothing but the genesis epoch has been attested, so there is no track record. The vault trades Robinhood Stock Tokens, price-tracking tokens, not shares, and not available to US persons, while the desk trades US equities through gated access; two doors, kept deliberately separate. Not an investment product and not investment advice.",
  },
  {
    q: "Whose key does the agent hold on-chain?",
    a: "On-chain, the agent holds a session key granted by the owner and scoped by expiry, order size, spend budget, trade count and a ticker allowlist — the ERC-4337 session-key design intent implemented at the contract layer rather than through the EntryPoint. Within that scope it can submit orders against the operator-funded vault; the vault re-checks every one against the compiled caps and reverts any breach, and a refused order spends none of the session budget. The agent’s limits are published on-chain before it trades — read them, and watch every order against them. The key is revocable at any time, and none of this touches the brokerage desk, where every order still requires your explicit yes. Mainnet, unaudited.",
  },
  {
    q: "Where’s the performance? Why “we publish our no’s”?",
    a: "There is no performance: TVL is 0, there are no depositors, no trades and no track record, and we won’t pretend otherwise. The first number we publish will be how often the vault said no. previewTrade() returns the exact rule an order would break before anyone signs, a refused order spends none of the session budget, and refusals and vetoes land in an append-only registry that cannot be pruned. Refusals are the only metric that can be accumulated honestly at zero TVL.",
  },
  {
    q: "How does it defend against prompt injection?",
    a: "The Macro/News analyst treats every fetched web page as untrusted data. Instruction-like text (“buy X now”, “ignore your rules”) is quoted and flagged, never obeyed.",
  },
  {
    q: "Is any of this financial advice?",
    a: "No. Sphynx is a research tool and reference architecture. There is no track record and no performance claim. All decisions, and all risk, are yours. Use only risk capital.",
  },
] as const;

/** The scripted desk run typed out by the interactive terminal. */
export type TermTag = "cmd" | "lime" | "mint" | "warn" | "red";
export const DESK_RUN: { tag: string; cls: TermTag; text: string; pause?: number }[] = [
  { tag: "$", cls: "cmd", text: "sphynx run --watchlist", pause: 380 },
  { tag: "SENSE", cls: "lime", text: "agentic account, equity $10,000 · cash $3,200", pause: 460 },
  { tag: "SCREEN", cls: "lime", text: "technical scan → AAPL · NVDA · MSFT", pause: 460 },
  { tag: "FUND", cls: "mint", text: "NVDA  valuation stretched · growth strong   score +1", pause: 520 },
  { tag: "TECH", cls: "mint", text: "NVDA  uptrend · pullback to EMA20            signal +2", pause: 520 },
  { tag: "MACRO", cls: "warn", text: "NVDA  risk-on · 1 injection quoted + ignored", pause: 520 },
  { tag: "SYNTH", cls: "lime", text: "propose BUY NVDA ×3  (mean-reversion)", pause: 560 },
  { tag: "RISK", cls: "warn", text: "sizing 4.2% ≤ cap 15% … APPROVE-WITH-CHANGES · stop 8%", pause: 620 },
  { tag: "PREVIEW", cls: "red", text: "est cost $1,410 · weight 4.2% · ⏸ awaiting your approval", pause: 200 },
];
