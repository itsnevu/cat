import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Oracle & Execution",
  description:
    "Where the vault's prices come from and how a swap actually happens: a 5-minute Uniswap V3 TWAP with a spot-deviation bound, and a typed adapter that can only swap against owner-registered USDG pools.",
  eyebrow: "22, On-chain · Oracle & execution",
  blocks: [
    {
      type: "prose",
      md: "There is no Chainlink feed for Robinhood Stock Tokens on Robinhood Chain. What there is: deep Uniswap V3 pools against USDG (NVDA ~$3.7M, SPY ~$500k, AAPL ~$350k at deploy). SPHYNX uses those pools twice, as the **price source** and as the **execution venue**, with different defences for each role.",
    },
    {
      type: "heading",
      text: "UniswapV3Oracle",
    },
    {
      type: "prose",
      md: "`priceE18(token)` returns USDG per one whole token as an 18-decimal fixed point. It is a **time-weighted average** over `twapSeconds` (300 at launch), read from the pool's own observation ring via `observe()`. A TWAP cannot be moved inside one block, and moving a 5-minute average on a multi-million-dollar pool costs real money for every second it is held.",
    },
    {
      type: "code",
      lang: "solidity",
      filename: "UniswapV3Oracle.sol",
      code: `function priceE18(address token) external view returns (uint256) {
    IUniswapV3Pool pool = poolOf[token];
    if (address(pool) == address(0)) revert NoPool(token);
    bool usdgIs0 = pool.token0() == usdg;

    uint256 twap = _quote(_twapSqrt(pool), usdgIs0);
    (uint160 spotSqrt,,,,,,) = pool.slot0();
    uint256 spot = _quote(spotSqrt, usdgIs0);

    uint256 diff = spot > twap ? spot - twap : twap - spot;
    if (diff * 10_000 > twap * maxSpotDeviationBps) revert SpotDeviates(token);   // 3% at launch
    return twap;
}`,
    },
    {
      type: "prose",
      md: "The second defence is the **deviation bound**. If spot has run more than `maxSpotDeviationBps` away from the average, the read reverts. That is the signature of a manipulation in progress (someone just shoved the pool) or of a genuine gap the average has not caught up with; either way the vault should not value or trade until it settles. A revert here makes `totalAssets()` revert, which freezes deposits, withdrawals and orders. `redeemInKind()` is unaffected.",
    },
    {
      type: "table",
      headers: ["Parameter", "Launch value", "Owner-changeable", "Effect"],
      rows: [
        ["`twapSeconds`", "300", "yes", "Longer = harder to move, slower to track a real move"],
        ["`maxSpotDeviationBps`", "300 (3%)", "yes", "Tighter = more false freezes, safer marks"],
        ["`poolOf[token]`", "0.05% USDG pools", "yes", "Must be a USDG/token pool or `setPool` reverts"],
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "TWAP is not an oracle network",
      md: "A pool TWAP reflects on-chain trading, not the NYSE print. Overnight and on weekends the pool can drift from the underlying; the 24/7 market is real and so is its basis risk. A determined attacker with enough capital can move a 5-minute average. The bound and the cash buffer limit the damage; they do not make it impossible. `PostedPriceOracle` (an owner-fed feed with a heartbeat) is in the repo as an alternative for a desk that trusts its own feed more than the pool.",
    },
    {
      type: "heading",
      text: "UniswapV3Adapter",
    },
    {
      type: "prose",
      md: "The vault never talks to a router. It approves the adapter for exactly `amountIn` and calls `swap(tokenIn, tokenOut, amountIn, minAmountOut, to)`. The adapter looks up the **one** pool registered for that token, pulls the input, and calls `pool.swap()` directly with the vault as recipient. There is no path array to tamper with, no arbitrary target, no calldata the desk could craft to reach another contract.",
    },
    {
      type: "code",
      lang: "solidity",
      filename: "UniswapV3Adapter.sol",
      code: `function setPool(address token, IUniswapV3Pool pool) external onlyOwner {
    address t0 = pool.token0(); address t1 = pool.token1();
    if (!((t0 == usdg && t1 == token) || (t1 == usdg && t0 == token))) revert BadPool();
    poolOf[token] = pool;
}

function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata data) external {
    if (msg.sender != _expectedPool) revert BadCallback();   // only the pool we just called
    address tokenIn = abi.decode(data, (address));
    IERC20(tokenIn).safeTransfer(msg.sender, uint256(a0 > 0 ? a0 : a1));
}`,
    },
    {
      type: "prose",
      md: "`quote()` simulates the same swap and reverts with the output amount in the revert data (the standard V3 quoter trick), so the terminal can show \"you receive\" without a quoter contract. It is a non-view function called with `eth_call`.",
    },
    {
      type: "heading",
      text: "Slippage, two layers",
    },
    {
      type: "list",
      items: [
        "**Adapter:** `pool.swap()` runs to the price limit, then the adapter checks `amountOut ≥ minAmountOut` and reverts `SlippageNotMet`.",
        "**Vault:** measures its own balance delta and independently checks it against `minAmountOut`. The vault does not trust the adapter's return value.",
      ],
    },
    {
      type: "prose",
      md: "`minAmountOut` is set by the caller. The [Trade terminal](/trade) derives it from `quote()` minus your slippage setting (1% default). Set it to 0 and you accept whatever the pool gives; the guardrails still hold, but a sandwich could eat the difference.",
    },
    {
      type: "heading",
      text: "Verified periphery",
    },
    {
      type: "table",
      caption: "Every address confirmed by direct call on 2026-09-20, not copied from a docs page.",
      headers: ["Thing", "Address", "Checked"],
      rows: [
        ["USDG (Global Dollar)", "`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`", "`decimals()` = 6, `symbol()` = USDG. An 18-decimal look-alike exists on the chain; the deploy script pins 6."],
        ["Uniswap V3 factory", "`0x1f7d7550B1b028f7571E69A784071F0205FD2EfA`", "`getPool(USDG, token, 500)` returns the pools below"],
        ["USDG/NVDA 0.05%", "`0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3`", "~3.69M USDG, ~11.6k NVDA"],
        ["USDG/AAPL 0.05%", "`0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D`", "~356k USDG, ~660 AAPL"],
        ["USDG/SPY 0.05%", "`0xa7Bb1AC63BBaB0C44316E6c8C455213441689167`", "~496k USDG, ~253 SPY"],
      ],
    },
    {
      type: "note",
      md: "The Uniswap **V2** router on the chain (`0x89e5…9eba`) has dust-level stock-token pools (0.19 USDG in NVDA/USDG). It is not used. The first draft of the adapter targeted it; the fork test caught a $0.02 NVDA price and the V3 rewrite followed.",
    },
  ],
};
