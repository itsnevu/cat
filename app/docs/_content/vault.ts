import type { DocContent } from "./types";

export const content: DocContent = {
  title: "The Vault",
  description:
    "RWAVault (vSPHYNX): an ERC-4626 vault over USDG that holds tokenized stocks and reverts any order breaching its written caps. How shares are priced, how NAV is computed, what previewTrade checks, and the exits that always work.",
  eyebrow: "20, On-chain · Vault",
  blocks: [
    {
      type: "prose",
      md: "`RWAVault` is the custody layer. It holds USDG and allowlisted Stock Tokens, issues **vSPHYNX** shares against them, and is the only contract that can move value. It has exactly one door for trading, `executeTrade()`, and that door is guarded by the same `previewTrade()` anyone can call for free.",
    },
    {
      type: "pills",
      items: ["ERC-4626", "USDG (6 dec)", "shares 12 dec", "Ownable2Step", "Pausable", "ReentrancyGuard", "OpenZeppelin v5.1"],
    },
    {
      type: "heading",
      text: "Shares and NAV",
    },
    {
      type: "prose",
      md: "The vault is a standard ERC-4626 over USDG with a **6-decimal offset**: one USDG of NAV is 1,000,000 share units, so vSPHYNX has 12 decimals. The offset makes the first-depositor inflation attack economically pointless (an attacker would need to donate a million times the victim's deposit to move the price by one unit).",
    },
    {
      type: "code",
      lang: "solidity",
      filename: "RWAVault.sol",
      code: `function totalAssets() public view override returns (uint256 nav) {
    nav = usdgBalance();
    for (uint256 i = 0; i < _allowlist.length; i++) nav += positionValue(_allowlist[i]);
}

function positionValue(address token) public view returns (uint256) {
    uint256 bal = IERC20(token).balanceOf(address(this));
    if (bal == 0) return 0;
    return bal.mulDiv(oracle.priceE18(token), 1e30);   // 18-dec units × 18-dec price → 6-dec USDG
}`,
    },
    {
      type: "prose",
      md: "NAV is cash plus every allowlisted position at the **oracle's price**, which is a 5-minute TWAP from the token's Uniswap V3 pool (see [Oracle & Execution](/docs/oracle)). Because the oracle reverts on a stale or deviating price, `totalAssets()` reverts too, and with it every deposit, withdrawal and order. The vault would rather refuse than value the book wrong. `redeemInKind()` does not need a price and keeps working.",
    },
    {
      type: "heading",
      text: "What previewTrade checks, in order",
    },
    {
      type: "prose",
      md: "The check is a pure view. It short-circuits at the first rule broken, so the verdict names the **first** reason, not all of them.",
    },
    {
      type: "steps",
      steps: [
        { label: "1", title: "Paused → ZeroAmount → NotAllowed", md: "Cheap gates first. The token must be on the owner's allowlist (max 16 entries)." },
        { label: "2", title: "Unfunded", md: "NAV must be non-zero. Everything below is a percentage of NAV." },
        { label: "3", title: "MaxDailyOrders", md: "Executed orders today (UTC) must be below `maxDailyOrders`. Applies to buys and sells." },
        { label: "4", title: "Sells stop here", md: "A sell only needs `held ≥ amountIn`. Reducing risk is never refused by a risk cap." },
        { label: "5", title: "DailyLossHalt", md: "If NAV is below the day's opening NAV by more than `dailyLossHaltBps`, buys are frozen for the day. The opening NAV is captured on the first order of the day." },
        { label: "6", title: "MissingStop", md: "`stopPriceE18` must be > 0, < mark, and ≥ mark × (1 − `stopLossBps`). A nominal $0.01 stop fails." },
        { label: "7", title: "PerTradeCap", md: "`amountIn ≤ NAV × perTradeBps`." },
        { label: "8", title: "Concentration", md: "Current position value + `amountIn` ≤ NAV × `maxConcentrationBps`." },
        { label: "9", title: "MaxPositions", md: "If this would open a new token, distinct positions must be below `maxOpenPositions`." },
        { label: "10", title: "CashBuffer", md: "Cash after the buy ≥ NAV × `cashBufferBps`." },
        { label: "11", title: "NoAveragingIntoLoser", md: "If the token is already held and mark < average cost, refused unless `leftSideException` is set." },
      ],
    },
    {
      type: "heading",
      text: "Execution",
    },
    {
      type: "prose",
      md: "`executeTrade()` is `onlyExecutor` and `nonReentrant`. It re-runs the check, reverts with `GuardrailBreach(violation)` on anything but `None`, then approves the adapter for exactly `amountIn` and calls `swap()`. The vault measures its own balance before and after; if it received less than `minAmountOut` it reverts `SlippageNotMet` regardless of what the adapter claimed. Cost basis is average-cost: a buy adds `amountIn` to `costUsdg`, a sell removes the proportional share.",
    },
    {
      type: "callout",
      tone: "info",
      title: "The stop is a record, not a trigger",
      md: "The vault stores the stop set on the last buy so the book carries its own risk plan on chain, but nothing in the contracts watches prices and sells. The desk (or the agent's session) has to act on it. What the vault guarantees is that no buy ever enters **without** one.",
    },
    {
      type: "heading",
      text: "Exits",
    },
    {
      type: "compare",
      left: {
        title: "withdraw / redeem (cash)",
        rows: [
          "Standard ERC-4626, returns USDG",
          "Limited to USDG the vault holds (`maxWithdraw`)",
          "Refused while paused",
          "Needs a valid oracle price to value shares",
        ],
      },
      right: {
        title: "redeemInKind",
        tone: "good",
        rows: [
          "Returns your slice of cash **and every token**",
          "Never limited by cash on hand",
          "Works while paused",
          "Needs no oracle: pure balance arithmetic",
        ],
      },
    },
    {
      type: "prose",
      md: "`redeemInKind()` burns `shares`, then transfers `balance × shares × (1 − exitFee) / supply` of USDG and of each allowlisted token. The exit fee (max 1%, 0% at launch) is not transferred anywhere: it simply stays, raising the share price for everyone left. Cost basis is scaled down with the units that leave so the average cost of the remaining position is unchanged.",
    },
    {
      type: "heading",
      text: "Owner powers, and their limits",
    },
    {
      type: "table",
      headers: ["Owner can", "Owner cannot"],
      rows: [
        ["Set the executor, oracle, adapter, guardrails contract", "Withdraw or transfer any asset"],
        ["Change the deposit cap", "Mint shares"],
        ["Pause deposits and orders", "Block `redeemInKind`"],
        ["Add or remove tokens from the allowlist (max 16)", "Trade (only the executor can)"],
        ["Set the exit fee, up to 1%", "Set a management or performance fee (none exist)"],
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "No timelock",
      md: "Ownership is `Ownable2Step` (a transfer must be accepted by the new owner), but a change the owner signs takes effect in the same transaction. Swapping the oracle for a malicious one is the sharpest edge: it would misprice NAV and could let the executor trade at a bad mark. Mitigations today: the adapter can only swap against pre-registered USDG pools, and `redeemInKind` needs no oracle. A timelock is the first planned upgrade. See [Risks](/docs/risks).",
    },
    {
      type: "heading",
      text: "Events",
    },
    {
      type: "code",
      lang: "solidity",
      code: `event TradeExecuted(address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 priceE18, uint256 navAfter);
event RedeemedInKind(address indexed owner, address indexed receiver, uint256 shares, uint256 usdgOut);
event AllowlistSet(address token, bool allowed);
event DepositCapSet(uint256 cap);   event ExitFeeSet(uint16 bps);
event ExecutorSet(address);  event OracleSet(address);  event AdapterSet(address);  event GuardrailsSet(address);
// plus ERC-4626 Deposit / Withdraw and Pausable Paused / Unpaused`,
    },
    {
      type: "prose",
      md: "The [Trade terminal](/trade) builds its Trades and Deposits tabs from `TradeExecuted`, `Deposit`, `Withdraw` and `RedeemedInKind`. Addresses and ABIs in [Contracts](/docs/contracts).",
    },
  ],
};
