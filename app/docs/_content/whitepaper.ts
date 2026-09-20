import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Whitepaper",
  description:
    "SPHYNX: an AI research desk with two doors and one rulebook. The problem with autonomous trading agents, the desk that stops at a preview, the vault that reverts what the desk would only refuse, and why the first number we publish is how often it said no.",
  eyebrow: "00, Whitepaper · v1.0 · September 2026",
  blocks: [
    {
      type: "prose",
      md: "**Abstract.** Tokenized equities made the stock market a 24-hour venue where a trade is one transaction. Autonomous AI agents can now research, decide and execute without a human in the loop. Put together, these create a machine that can lose money faster than anyone can watch it. SPHYNX is a design for the opposite: a desk where research is autonomous and execution is structurally gated. On the brokerage door, a team of specialist agents produces a preview and a human approves every order. On the on-chain door, an ERC-4626 vault compiles the same written risk caps into code and reverts any order that breaches them, while the agent trades through a session key that expires and spends nothing on a refusal. Both doors are open today: the desk runs in Claude Code against a Robinhood Agentic account; the vault is live on Robinhood Chain mainnet. This paper describes the mechanism, the trust model, what is proven and what is not.",
    },
    { type: "divider" },
    {
      type: "heading",
      text: "1. The problem",
    },
    {
      type: "prose",
      md: "Every trading agent demo makes the same promise: give the model an API key and let it work. Every honest post-mortem tells the same story: it worked until it didn't, and by then it had the keys. Three things go wrong at once.",
    },
    {
      type: "list",
      items: [
        "**The agent holds standing authority.** An API key or a hot wallet has no expiry, no budget, no size limit. A prompt injection in a news article, a hallucinated signal, a bug in a loop, and the account is the blast radius.",
        "**The rules live in the prompt.** \"Never risk more than 2%\" is a sentence the model reads. It is not a constraint the model cannot violate. Under pressure, models reinterpret sentences.",
        "**The record is editable.** Wins are posted; losses and refusals are logged to a file the operator controls. There is no way for an outsider to check whether the guardrails ever fired.",
      ],
    },
    {
      type: "prose",
      md: "The usual answer is \"add more guardrails to the prompt\" or \"add a human approval step\". The first does not change the trust model. The second is right, and SPHYNX does it, but it does not scale to a venue that never closes. What is needed is a place where the rules are **enforced** rather than **read**, and a record that cannot be pruned.",
    },
    {
      type: "heading",
      text: "2. Design principles",
    },
    {
      type: "cards",
      columns: 2,
      cards: [
        { title: "Least privilege is structural", badge: "01", md: "The analysts hold no order tools in their agent definitions. The vault trusts one executor. The executor trusts one session per key. Each layer would still hold if the one above it failed." },
        { title: "Preview before commit", badge: "02", md: "Every order has a free, read-only preview that names the exact rule it would break. The desk stops at a preview card; the vault exposes `previewTrade()`. Nobody signs blind." },
        { title: "Refusals are free and recorded", badge: "03", md: "A refused order costs the session nothing and goes on an append-only record. The system is designed to say no often and to be judged on it." },
        { title: "Nothing aspirational", badge: "04", md: "No component exists in the docs that does not exist in the repo. No token. No backend. No database. If a thing is not built, the docs say \"not built\"." },
      ],
    },
    {
      type: "heading",
      text: "3. Door one: the brokerage desk",
    },
    {
      type: "prose",
      md: "The desk is a Claude Code session. The main session is the **Portfolio Manager**, the only role with order tools. It dispatches three read-only analysts (fundamental, technical, macro/news) as sub-agents defined in Markdown, routes their findings through an independent **Risk Manager** running on a larger model, and synthesises one proposal tied to a written rule in `strategies/`. The output is a preview card. The desk stops there.",
    },
    {
      type: "diagram",
      title: "A desk run · steps 1-6 place no order",
      ascii: `SENSE → SCREEN → RESEARCH (3 analysts, parallel, read-only)
      → SYNTHESIZE → RISK (approve / changes / veto) → PREVIEW
      → APPROVAL (human says yes)  ← the desk waits here
      → EXECUTE (still behind a deny→ask→allow permission gate)
      → CONFIRM → SNAPSHOT + append-only log`,
    },
    {
      type: "prose",
      md: "Safeguards on this door are structural rather than promised: the analysts cannot place orders because they do not have the tool; the news analyst is isolated so injected instructions cannot reach the PM; the permission gate in `.claude/settings.json` denies options, asks on equity orders, allows reads; the kill switch is `claude mcp remove robinhood-trading`. The broker is reached through a single MCP endpoint with OAuth completed in-session; no token lives in the repo. Full detail in [Architecture](/docs/architecture), [Guardrails](/docs/guardrails) and [Prompt-injection defense](/docs/prompt-injection).",
    },
    {
      type: "heading",
      text: "4. Door two: the vault",
    },
    {
      type: "prose",
      md: "The on-chain module takes the same rulebook and compiles it. Where the desk's Risk Manager reads `strategies/` and vetoes, `RWAVault` reads `GuardrailConfig.caps()` and reverts. The difference is who can override: a model can be argued with; a contract cannot.",
    },
    {
      type: "table",
      headers: ["Rule", "On the desk", "In the vault"],
      rows: [
        ["Per-trade size", "Risk Manager checks against strategy note", "`PerTradeCap` revert"],
        ["Concentration", "Risk Manager", "`Concentration` revert"],
        ["Stop on every buy", "Preview card must show one", "`MissingStop` revert; stop recorded on chain"],
        ["Daily loss halt", "PM refuses to propose", "`DailyLossHalt` revert on buys"],
        ["Cash buffer", "Risk Manager", "`CashBuffer` revert"],
        ["No averaging into losers", "Strategy note", "`NoAveragingIntoLoser` revert unless flagged"],
        ["Allowed instruments", "MCP permission gate", "Allowlist + `NotAllowed` revert"],
        ["Human approval", "Required, every order", "Replaced by a scoped, expiring session key"],
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "4.1 Three layers",
    },
    {
      type: "deflist",
      items: [
        { term: "Session scoping · SessionKeyExecutor", md: "The agent holds no wallet over the book. It holds a session: expiry, per-trade notional, cumulative budget, trade count, allowed sides, allowed tickers. `execute()` checks all of them, then calls the vault. Because the counters are incremented after the vault call, a refused order reverts the whole transaction and spends nothing. Granted and revoked by the owner in one transaction each." },
        { term: "Custody-layer caps · RWAVault + GuardrailConfig", md: "An ERC-4626 vault over USDG with a 6-decimal share offset. `previewTrade()` is a view that returns the first rule an order breaks, in a fixed order, or `None`. `executeTrade()` runs the same check, swaps through a typed adapter, and verifies its own balance delta against `minAmountOut`. Depositors can always leave: cash up to what the vault holds, or `redeemInKind()` for a pro-rata slice of everything, even when paused, with no oracle dependency." },
        { term: "Append-only record · DeskRegistry", md: "Attestations keyed by a subject the attester owns: epoch, NAV, realised P&L, snapshot hash, URI. Nothing can be edited or removed. This is where refusals and vetoes are published, and where the first honest metric lives." },
      ],
    },
    {
      type: "heading",
      level: 3,
      text: "4.2 Prices and execution",
    },
    {
      type: "prose",
      md: "There is no oracle network for Robinhood Stock Tokens. There are deep Uniswap V3 pools against USDG. The vault uses a **5-minute TWAP** from those pools as its mark, with a **deviation bound**: if spot is more than 3% from the average the read reverts, which freezes valuation and trading until the pool settles. Execution goes through `UniswapV3Adapter`, which can only swap against a pool the owner registered for that token and always paired with USDG; there is no router, no path, no arbitrary call. Slippage is bounded twice, by the adapter and independently by the vault's own balance check. Detail in [Oracle & Execution](/docs/oracle).",
    },
    {
      type: "heading",
      text: "5. Trust model",
    },
    {
      type: "prose",
      md: "A trust model is a list of who can hurt you and how much. SPHYNX's, honestly stated:",
    },
    {
      type: "table",
      headers: ["Party", "Can", "Cannot", "Bounded by"],
      rows: [
        ["Anyone", "Deposit, withdraw, redeem in kind, preview any order, read everything", "Trade", "Deposit cap"],
        ["Session holder (agent)", "Execute orders inside the session and the caps", "Withdraw, change caps, exceed budget", "Expiry, notional, budget, count, side, ticker, every vault cap"],
        ["Owner", "Change oracle, adapter, guardrails, caps (within ceilings), deposit cap, allowlist, exit fee (≤1%), pause, grant/revoke sessions", "Move assets, mint shares, block redeemInKind, set a management fee", "Hard ceilings; Ownable2Step; redeemInKind needs no oracle"],
        ["Pool LPs / MEV", "Move spot inside a block", "Move the 5-minute TWAP cheaply; fill below minAmountOut", "Deviation bound, slippage floor, cash buffer, concentration cap"],
        ["Token issuer", "Pause or delist a Stock Token", "Touch USDG or other positions", "Allowlist; redeemInKind hands units back regardless"],
      ],
    },
    {
      type: "callout",
      tone: "danger",
      title: "What is not in the trust model yet",
      md: "**No audit.** **No timelock**: an owner change lands in one transaction. **One EOA** is owner and session holder at launch. These are the three items at the top of [Risks](/docs/risks), in order, and the deposit cap stays at 10,000 USDG until the first two are done.",
    },
    {
      type: "heading",
      text: "6. What is proven",
    },
    {
      type: "list",
      items: [
        "**Every refusal path** has a unit test that asserts the exact `Violation` and, for the session, that counters did not move (`test/Desk.t.sol`, 29 tests).",
        "**The real pool works end to end.** On a fork of mainnet at block 67,480,547: deposit 1,000 USDG, buy 100 USDG of NVDA through the real USDG/NVDA pool (received 0.4497 NVDA at a $222.28 TWAP), NAV after 999.95, sell it all back for 99.90 USDG, then a 500 USDG order refused as `PerTradeCap` with `tradesUsed` unchanged (`test/Fork.t.sol`).",
        "**The deploy is reproducible.** `script/Deploy.s.sol` verifies USDG decimals and the pool's token before broadcasting and writes the address file the site reads.",
        "**The site reads the chain, not a database.** `/api/chain` and the [Trade terminal](/trade) call the contracts; there is nothing for us to edit.",
      ],
    },
    {
      type: "heading",
      text: "7. What is not proven",
    },
    {
      type: "prose",
      md: "There is no track record. NAV is zero at the time of writing and there are no depositors. The strategy has not been run against real capital for any period. The contracts have not been reviewed by anyone outside the project. The pool TWAP has not been stress-tested by an adversary with capital. Every one of these is a sentence we would rather write now than have someone else write later.",
    },
    {
      type: "heading",
      text: "8. Economics",
    },
    {
      type: "prose",
      md: "There is **no fee to the operator** anywhere in the contracts: no management fee, no performance fee, no carry. The only fee is an optional exit fee (0% at launch, hard-capped at 1%) that stays in the vault for remaining holders. There is **no token**: `$SPHYNX` is not built, not planned for this phase, and has no relationship to vSPHYNX shares, which are the plain ERC-4626 accounting unit. The desk's value to its operator is the desk itself; the vault exists to make the rulebook enforceable, not to extract from it.",
    },
    {
      type: "heading",
      text: "9. Roadmap",
    },
    {
      type: "steps",
      steps: [
        { label: "now", title: "Mainnet, capped, one operator", md: "Vault live at 10,000 USDG cap. First trades from the operator's own funds. Publish the refusal count." },
        { label: "next", title: "Keys and time", md: "Separate agent key. 2-of-3 Safe as owner. Timelock on oracle/adapter/guardrails/caps." },
        { label: "then", title: "Audit and second price source", md: "Independent audit, published. PostedPriceOracle with heartbeat alongside the TWAP; the vault takes the conservative mark. Raise the cap only after both." },
        { label: "later", title: "Attested runs", md: "Every desk run attests NAV, P&L and a snapshot hash to the registry. The dashboard shows refusals per run. A PerfScore contract computes from attestations, not from claims." },
      ],
    },
    {
      type: "heading",
      text: "10. Conclusion",
    },
    {
      type: "prose",
      md: "Markets never close now. The honest response is not a faster agent; it is a gatekeeper that never sleeps either, whose rules cannot be talked around, whose refusals cost nothing and are written where nobody can erase them. SPHYNX is that gatekeeper on both doors. On one it hands you a card and waits. On the other it reverts. The first number it will publish is how often it said no.",
    },
    { type: "divider" },
    {
      type: "note",
      md: "Addresses in [Contracts](/docs/contracts). Everything runnable in the repo. This document is versioned with the code; the version at the top changes when the contracts do.",
    },
  ],
};
