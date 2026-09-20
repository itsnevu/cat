import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Risks",
  description:
    "What can go wrong with the on-chain desk, ranked by how much it would cost you, what limits each one today, and what is planned. Read this before depositing.",
  eyebrow: "24, On-chain · Risks",
  blocks: [
    {
      type: "prose",
      md: "This page is the honest inventory. The guardrails limit how badly a **strategy** can go; they do not remove the risks of the code, the chain, the pools, or the people holding the keys. Each item says what would have to happen, what stops it today, and what the plan is.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Summary",
      md: "No third-party audit. No timelock. One EOA owns everything and also holds the trading session. Prices are a pool TWAP, not an oracle network. Stock Tokens are not shares and are not for US persons. The deposit cap (10,000 USDG) is the only reason the blast radius is small.",
    },
    {
      type: "heading",
      text: "1. Smart-contract bugs",
    },
    {
      type: "prose",
      md: "**Would need:** a flaw in `RWAVault`, the adapter, the oracle math, or an OpenZeppelin dependency. **Today:** 29 unit tests covering every refusal path and exit, a mainnet-fork round trip, OpenZeppelin v5.1 for ERC-4626/Ownable/Pausable/ReentrancyGuard, `nonReentrant` on every value-moving function, checks-effects-interactions, balance-delta accounting rather than trusting return values. **Not today:** an independent audit, formal verification, a bug bounty. **Plan:** audit before the cap is raised; publish findings.",
    },
    {
      type: "heading",
      text: "2. Owner key compromise or misuse",
    },
    {
      type: "prose",
      md: "**Would need:** the deployer key to leak, or the operator to act badly. **What the owner can do:** swap the oracle for one that misprices NAV, swap the adapter, widen caps up to the hard ceilings, pause, change the deposit cap, grant a session to any address. **What the owner cannot do:** transfer assets out, mint shares, or block `redeemInKind`. **Today:** `Ownable2Step` prevents accidental transfers to a dead address; the hard ceilings in `GuardrailConfig` bound how far caps can be loosened; the adapter's `setPool` only accepts USDG pairs, so even a hostile adapter change cannot route to an arbitrary contract. **Not today:** a Safe, a timelock. **Plan:** 2-of-3 Safe first, then a timelock on `setOracle`, `setAdapter`, `setGuardrails` and `setCaps`.",
    },
    {
      type: "callout",
      tone: "warn",
      title: "The sharpest edge: a malicious oracle swap",
      md: "If the owner points the vault at an oracle that says NVDA is worth $1, NAV collapses, shares are mispriced, and a session could buy at that mark. Depositors' protection is `redeemInKind`, which needs no price: you get your pro-rata slice of the actual tokens regardless of what the oracle claims. A timelock would give you the window to use it.",
    },
    {
      type: "heading",
      text: "3. Session key compromise",
    },
    {
      type: "prose",
      md: "**Would need:** the agent's private key to leak. **Worst case:** the attacker trades inside the session, which is bounded by expiry, per-trade notional, budget, count, side and ticker, and every order still answers the vault's caps. They could churn the budget into slippage and fees; they could not withdraw. **Today:** all of the above, plus `revoke()` in one owner transaction. **Wrong today:** the launch session is on the **same key as the owner**. **Plan:** separate agent key before any deposit that matters.",
    },
    {
      type: "heading",
      text: "4. Price manipulation",
    },
    {
      type: "prose",
      md: "**Would need:** capital to move a 5-minute TWAP on a $3.7M pool (NVDA) or a $350k pool (AAPL) by enough to profit against the vault's small book. **Today:** the deviation bound reverts any read where spot is more than 3% from the average, which freezes valuation and trading while the pool is being pushed; the cash buffer and concentration caps limit exposure to any one mark; `minAmountOut` bounds execution. **Residual:** a slow, patient push inside the bound over many minutes. **Plan:** longer TWAP window as depth allows; a posted-price oracle with a heartbeat as a second source; Chainlink if a feed appears.",
    },
    {
      type: "heading",
      text: "5. Liquidity and basis",
    },
    {
      type: "prose",
      md: "**Pool depth is not constant.** The AAPL pool at $350k means a 1,500 USDG order moves it ~0.4%; a much bigger vault would need bigger pools or smaller caps. **The pool is not the NYSE.** Overnight and weekends the token trades on chain sentiment; the mark can sit away from the underlying for hours. **Withdrawals in cash are limited to USDG on hand;** when the book is mostly tokens, leaving in cash means waiting for a sell or taking the tokens in kind. None of this is hidden: the terminal shows pool-implied prices, spot deviation, cash on hand and withdrawable cash live.",
    },
    {
      type: "heading",
      text: "6. Stock Token issuer risk",
    },
    {
      type: "prose",
      md: "The tokens are issued by Robinhood's tokenization arm and track prices; they are **not shares**, carry no voting rights, and depend on the issuer's backing, its ability to pause (`oraclePaused()` exists on the token), and its legal status. They are **not offered to US persons**. The vault does not and cannot fix any of that. If a token is paused or delisted, the vault's position in it is stuck until it is not; `redeemInKind` still hands you the units.",
    },
    {
      type: "heading",
      text: "7. Chain and infrastructure",
    },
    {
      type: "prose",
      md: "Robinhood Chain is an Arbitrum Orbit rollup with its own sequencer. Sequencer downtime halts everything, including exits, until it returns. The public RPC rate-limits and is filtered on some ISPs; the site reads through its own server and caches for 20-30 seconds, so what you see can be half a minute stale. Blockscout verification is blocked by a Cloudflare challenge, which is why source is not yet verified on the explorer.",
    },
    {
      type: "heading",
      text: "8. Strategy risk",
    },
    {
      type: "prose",
      md: "The caps bound position size, concentration, cash, daily loss and stop depth. They do not bound being wrong. A desk that buys the top with a 5% stop on every position, four times a day, inside every cap, still loses money. There is no track record. The vault's NAV is 0 at the time of writing and there are no depositors. The first metric the project intends to publish is how often the vault said no, because that is the only honest number at TVL 0.",
    },
    {
      type: "heading",
      text: "What would change this page",
    },
    {
      type: "steps",
      steps: [
        { label: "1", title: "Separate agent key", md: "Removes item 3's \"wrong today\". One `cast wallet new` and one `grant()`." },
        { label: "2", title: "Safe as owner", md: "2-of-3. Removes single-key compromise from item 2." },
        { label: "3", title: "Timelock", md: "24-48h on oracle/adapter/guardrails/caps changes. Gives depositors the window to `redeemInKind`." },
        { label: "4", title: "Audit", md: "Independent. Published. Before the deposit cap moves." },
        { label: "5", title: "Second price source", md: "PostedPriceOracle with heartbeat, or Chainlink when available; vault takes the more conservative mark." },
        { label: "6", title: "Explorer verification", md: "So anyone can read the source next to the bytecode." },
      ],
    },
    {
      type: "note",
      md: "This page is versioned with the contracts. If the addresses in [Contracts](/docs/contracts) change, this page is re-reviewed.",
    },
  ],
};
