/**
 * Minimal, dependency-free reads from the SPHYNX contracts on Robinhood Chain
 * mainnet (chainId 4663). Everything here is a `view` call — nothing signs,
 * nothing spends. Selectors are precomputed (cast sig) so no ABI lib is needed.
 * Addresses come from onchain/deployments/latest.json, written by the deploy script.
 */
import deployment from "../onchain/deployments/latest.json";

export const CHAIN_ID = 4663;
export const RPC_URL = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";

/** Addresses come from the last `forge script script/Deploy.s.sol --broadcast` (onchain/deployments/latest.json). */
export const DEPLOYMENT = deployment as {
  chainId: number; stale?: boolean; deployer: string; owner: string; agent: string; guardrailConfig: string;
  oracle: string; adapter: string; vault: string; executor: string; deskRegistry: string; registrySubject: string;
  usdg: string; nvda: string; aapl: string; spy: string; block: number;
};

export const ADDR = {
  vault: DEPLOYMENT.vault,
  guardrailConfig: DEPLOYMENT.guardrailConfig,
  executor: DEPLOYMENT.executor,
  deskRegistry: DEPLOYMENT.deskRegistry,
  safe: DEPLOYMENT.owner,
  agent: DEPLOYMENT.agent,
  usdg: DEPLOYMENT.usdg,
  oracle: DEPLOYMENT.oracle,
  adapter: DEPLOYMENT.adapter,
} as const;

/** DeskRegistry subject seeded at deploy: subjectFor(deployer, keccak("sphynx-vault:" + vault)). */
export const REGISTRY_SUBJECT = DEPLOYMENT.registrySubject;

/** Stock Tokens the vault allowlists and the adapter/oracle have pools for (18 decimals, price-tracking). */
export const STOCK_TOKENS: { ticker: string; name: string; address: string }[] = [
  { ticker: "NVDA", name: "NVIDIA", address: DEPLOYMENT.nvda },
  { ticker: "AAPL", name: "Apple", address: DEPLOYMENT.aapl },
  { ticker: "SPY", name: "S&P 500 ETF", address: DEPLOYMENT.spy },
];
export const tokenByTicker = (t: string) => STOCK_TOKENS.find((x) => x.ticker === t.toUpperCase());
export const tokenByAddress = (a: string) => STOCK_TOKENS.find((x) => x.address.toLowerCase() === a.toLowerCase());

export const SEL = {
  caps: "0x18e22d98", //           GuardrailConfig.caps()
  count: "0x7937354c", //          DeskRegistry.count(bytes32)
  at: "0x72ec86a8", //             DeskRegistry.at(bytes32,uint256)
  sessions: "0x431a1b97", //       SessionKeyExecutor.sessions(address)
  isLive: "0x50c116b8", //         SessionKeyExecutor.isLive(address)
  previewTrade: "0x266d144e", //   RWAVault.previewTrade((address,bool,uint256,uint256,uint256,bool))
  quoteNotional: "0xd1950f18", //  RWAVault.quoteNotional(trade)
  depositCap: "0xdbd5edc7", //     RWAVault.depositCap()
  totalAssets: "0x01e1d114", //    RWAVault.totalAssets()
  totalSupply: "0x18160ddd", //    ERC20.totalSupply()
  balanceOf: "0x70a08231", //      ERC20.balanceOf(address)
  paused: "0x5c975abb", //         RWAVault.paused()
  isAllowed: "0xbabcc539", //      RWAVault.isAllowed(address)
  usdgBalance: "0x6f7dd16d", //    RWAVault.usdgBalance()
  openPositions: "0xcc35b490", //  RWAVault.openPositions()
  positions: "0x55f57510", //      RWAVault.positions(address) -> (costUsdg, stopPriceE18)
  positionValue: "0x4de7c7bd", //  RWAVault.positionValue(address)
  today: "0xb74e452b", //          RWAVault.today() -> (day, orders, openNav)
  exitFeeBps: "0x57b17a52", //     RWAVault.exitFeeBps()
  convertToAssets: "0x07a2d13a", //ERC4626.convertToAssets(uint256)
  maxWithdraw: "0xce96cb77", //    ERC4626.maxWithdraw(address)
  priceE18: "0x3a697cad", //       UniswapV3Oracle.priceE18(address)  (TWAP)
  spotE18: "0xfd6bf3db", //        UniswapV3Oracle.spotE18(address)
  quote: "0xb6466384", //          UniswapV3Adapter.quote(address,address,uint256)
} as const;

export const TOPIC = {
  TradeExecuted: "0xe78f5fd9367d0d84ee1fa462c21b23d64683f6b39d47aaec184ec181323e2991",
  Deposit: "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
  Withdraw: "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db",
  RedeemedInKind: "0x5d242e3bd926751f71298786a88955872a1a7bbf75505377b9e0461949a69173",
} as const;

/** Guardrails.Violation — index order is the contract's enum order. */
export const VIOLATIONS = [
  "None", "Unfunded", "DailyLossHalt", "PerTradeCap", "MaxDailyOrders", "Concentration",
  "MaxPositions", "CashBuffer", "NoAveragingIntoLoser", "MissingStop", "NotAllowed",
  "ZeroAmount", "InsufficientPosition", "Paused",
] as const;
export type Violation = (typeof VIOLATIONS)[number];

export const VIOLATION_TEXT: Record<Violation, string> = {
  None: "Passes every cap. The Sphinx lets it through — a human still has to sign.",
  Unfunded: "The vault holds no assets (NAV 0). Nothing can trade against an empty book.",
  DailyLossHalt: "The day's loss already crossed the halt line; buys are frozen for the day.",
  PerTradeCap: "Single order larger than the per-trade cap (% of NAV).",
  MaxDailyOrders: "The daily order count is already used up.",
  Concentration: "Would put too much of NAV in one symbol.",
  MaxPositions: "Would open more distinct positions than allowed.",
  CashBuffer: "Would leave less cash than the required buffer.",
  NoAveragingIntoLoser: "Adding to a losing position is refused unless a written left-side plan applies.",
  MissingStop: "Buys must carry a real stop below market, no deeper than the stop-loss cap.",
  NotAllowed: "Token is not on the vault allowlist.",
  ZeroAmount: "Order amount is zero.",
  InsufficientPosition: "Sell exceeds the held balance.",
  Paused: "The vault is paused.",
};

const pad = (hex: string, bytes = 32) => hex.replace(/^0x/, "").padStart(bytes * 2, "0");
export const word = (n: bigint) => pad(n.toString(16));
export const addrWord = (a: string) => pad(a.toLowerCase());
const boolWord = (b: boolean) => word(b ? 1n : 0n);

async function rpc(method: string, params: unknown[], fetchImpl: typeof fetch = fetch, attempt = 0): Promise<unknown> {
  const res = await fetchImpl(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  } as RequestInit);
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    return rpc(method, params, fetchImpl, attempt + 1);
  }
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

export async function ethCall(to: string, data: string, fetchImpl?: typeof fetch): Promise<string> {
  return ((await rpc("eth_call", [{ to, data }, "latest"], fetchImpl)) as string | null) ?? "0x";
}

/** Split a return blob into 32-byte words as bigints. */
export function words(hex: string): bigint[] {
  const h = hex.replace(/^0x/, "");
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
  return out;
}
const u = async (to: string, data: string, f?: typeof fetch) => words(await ethCall(to, data, f))[0] ?? 0n;

export type Caps = {
  perTradeBps: number; maxConcentrationBps: number; maxOpenPositions: number; maxDailyOrders: number;
  stopLossBps: number; dailyLossHaltBps: number; cashBufferBps: number;
};
export async function readCaps(f?: typeof fetch): Promise<Caps> {
  const w = words(await ethCall(ADDR.guardrailConfig, SEL.caps, f));
  return {
    perTradeBps: Number(w[0]), maxConcentrationBps: Number(w[1]), maxOpenPositions: Number(w[2]),
    maxDailyOrders: Number(w[3]), stopLossBps: Number(w[4]), dailyLossHaltBps: Number(w[5]), cashBufferBps: Number(w[6]),
  };
}

export type Session = {
  active: boolean; expiry: number; maxNotionalPerTrade: string; maxTrades: number; tradesUsed: number;
  maxCumNotional: string; cumNotionalUsed: string; buysAllowed: boolean; sellsAllowed: boolean; live: boolean;
};
export async function readSession(agent: string, f?: typeof fetch): Promise<Session> {
  const w = words(await ethCall(ADDR.executor, SEL.sessions + addrWord(agent), f));
  const live = (await u(ADDR.executor, SEL.isLive + addrWord(agent), f)) === 1n;
  return {
    active: w[0] === 1n, expiry: Number(w[1]), maxNotionalPerTrade: w[2].toString(), maxTrades: Number(w[3]),
    tradesUsed: Number(w[4]), maxCumNotional: w[5].toString(), cumNotionalUsed: w[6].toString(),
    buysAllowed: w[7] === 1n, sellsAllowed: w[8] === 1n, live,
  };
}

export type Attestation = { epoch: number; timestamp: number; nav: string; realizedPnl: string; snapshotHash: string; uri: string };
export async function readRegistry(f?: typeof fetch): Promise<{ count: number; latest: Attestation[] }> {
  const count = Number(await u(ADDR.deskRegistry, SEL.count + REGISTRY_SUBJECT.slice(2), f));
  const latest: Attestation[] = [];
  for (let i = Math.max(0, count - 8); i < count; i++) {
    const raw = await ethCall(ADDR.deskRegistry, SEL.at + REGISTRY_SUBJECT.slice(2) + word(BigInt(i)), f);
    const h = raw.replace(/^0x/, "");
    const off = Number(BigInt("0x" + h.slice(0, 64))) * 2;
    const w = words("0x" + h.slice(off));
    const nav = w[2]; const pnl = BigInt.asIntN(256, w[3]);
    const uriOff = Number(w[5]) * 2; const uriLen = Number(BigInt("0x" + h.slice(off + uriOff, off + uriOff + 64)));
    const uriHex = h.slice(off + uriOff + 64, off + uriOff + 64 + uriLen * 2);
    const uri = Buffer.from(uriHex, "hex").toString("utf8");
    latest.push({ epoch: Number(w[0]), timestamp: Number(w[1]), nav: nav.toString(), realizedPnl: pnl.toString(), snapshotHash: "0x" + w[4].toString(16).padStart(64, "0"), uri });
  }
  return { count, latest: latest.reverse() };
}

export type VaultState = {
  depositCap: string; totalAssets: string; totalSupply: string; usdgBalance: string; paused: boolean;
  openPositions: number; exitFeeBps: number; sharePriceE6: string; ordersToday: number; dayOpenNav: string;
};
export async function readVault(f?: typeof fetch): Promise<VaultState> {
  const depositCap = await u(ADDR.vault, SEL.depositCap, f);
  const totalAssets = await u(ADDR.vault, SEL.totalAssets, f);
  const totalSupply = await u(ADDR.vault, SEL.totalSupply, f);
  const usdgBalance = await u(ADDR.vault, SEL.usdgBalance, f);
  const paused = (await u(ADDR.vault, SEL.paused, f)) === 1n;
  const openPositions = Number(await u(ADDR.vault, SEL.openPositions, f));
  const exitFeeBps = Number(await u(ADDR.vault, SEL.exitFeeBps, f));
  const today = words(await ethCall(ADDR.vault, SEL.today, f));
  const dayNow = BigInt(Math.floor(Date.now() / 86_400_000));
  const ordersToday = today[0] === dayNow ? Number(today[1]) : 0;
  // one share (1e12 units) in USDG (6 dec), scaled to 6 decimals of precision
  const sharePriceE6 = totalSupply === 0n ? 1_000_000n : (await u(ADDR.vault, SEL.convertToAssets + word(10n ** 12n), f));
  return {
    depositCap: depositCap.toString(), totalAssets: totalAssets.toString(), totalSupply: totalSupply.toString(),
    usdgBalance: usdgBalance.toString(), paused, openPositions, exitFeeBps, sharePriceE6: sharePriceE6.toString(),
    ordersToday, dayOpenNav: (today[2] ?? 0n).toString(),
  };
}

export type Market = { ticker: string; name: string; address: string; twapE18: string; spotE18: string; oracleError?: string };
export async function readMarkets(f?: typeof fetch): Promise<Market[]> {
  const out: Market[] = [];
  for (const t of STOCK_TOKENS) {
    try {
      const twap = await u(ADDR.oracle, SEL.priceE18 + addrWord(t.address), f);
      const spot = await u(ADDR.oracle, SEL.spotE18 + addrWord(t.address), f);
      out.push({ ...t, twapE18: twap.toString(), spotE18: spot.toString() });
    } catch (e) {
      out.push({ ...t, twapE18: "0", spotE18: "0", oracleError: e instanceof Error ? e.message : "oracle read failed" });
    }
  }
  return out;
}

export type Position = {
  ticker: string; address: string; units: string; valueUsdg: string; costUsdg: string; stopPriceE18: string;
  avgCostE18: string; pnlUsdg: string; weightBps: number;
};
export async function readPositions(nav: bigint, f?: typeof fetch): Promise<Position[]> {
  const out: Position[] = [];
  for (const t of STOCK_TOKENS) {
    const units = await u(t.address, SEL.balanceOf + addrWord(ADDR.vault), f);
    if (units === 0n) continue;
    const value = await u(ADDR.vault, SEL.positionValue + addrWord(t.address), f);
    const p = words(await ethCall(ADDR.vault, SEL.positions + addrWord(t.address), f));
    const cost = p[0] ?? 0n;
    const avgCostE18 = units === 0n ? 0n : (cost * 10n ** 30n) / units;
    out.push({
      ticker: t.ticker, address: t.address, units: units.toString(), valueUsdg: value.toString(), costUsdg: cost.toString(),
      stopPriceE18: (p[1] ?? 0n).toString(), avgCostE18: avgCostE18.toString(), pnlUsdg: (value - cost).toString(),
      weightBps: nav === 0n ? 0 : Number((value * 10_000n) / nav),
    });
  }
  return out;
}

export type PreviewInput = { stockToken: string; isBuy: boolean; amountIn: bigint; minAmountOut: bigint; stopPriceE18: bigint; leftSideException: boolean };
export function encodeTrade(o: PreviewInput): string {
  return addrWord(o.stockToken) + boolWord(o.isBuy) + word(o.amountIn) + word(o.minAmountOut) + word(o.stopPriceE18) + boolWord(o.leftSideException);
}
export async function previewTrade(o: PreviewInput, f?: typeof fetch): Promise<Violation> {
  const idx = Number(await u(ADDR.vault, SEL.previewTrade + encodeTrade(o), f));
  return VIOLATIONS[idx] ?? "None";
}

/** Simulated swap output through the adapter (eth_call on a non-view function). */
export async function quoteSwap(tokenIn: string, tokenOut: string, amountIn: bigint, f?: typeof fetch): Promise<bigint> {
  return u(ADDR.adapter, SEL.quote + addrWord(tokenIn) + addrWord(tokenOut) + word(amountIn), f);
}

export type Trade = {
  block: number; tx: string; ticker: string; isBuy: boolean; amountIn: string; amountOut: string; priceE18: string; navAfter: string;
};
export async function readTrades(f?: typeof fetch, span = 200_000): Promise<Trade[]> {
  const head = Number(BigInt((await rpc("eth_blockNumber", [], f)) as string));
  const from = Math.max(DEPLOYMENT.block, head - span);
  const logs = (await rpc("eth_getLogs", [{
    address: ADDR.vault, fromBlock: "0x" + from.toString(16), toBlock: "latest", topics: [TOPIC.TradeExecuted],
  }], f)) as { blockNumber: string; transactionHash: string; topics: string[]; data: string }[];
  return logs.map((l) => {
    const w = words(l.data);
    const token = "0x" + l.topics[1].slice(26);
    return {
      block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, ticker: tokenByAddress(token)?.ticker ?? token.slice(0, 8),
      isBuy: w[0] === 1n, amountIn: w[1].toString(), amountOut: w[2].toString(), priceE18: w[3].toString(), navAfter: w[4].toString(),
    };
  }).reverse();
}

export type Flow = { block: number; tx: string; kind: "deposit" | "withdraw" | "redeemInKind"; owner: string; assets: string; shares: string };
export async function readFlows(f?: typeof fetch, span = 200_000): Promise<Flow[]> {
  const head = Number(BigInt((await rpc("eth_blockNumber", [], f)) as string));
  const from = Math.max(DEPLOYMENT.block, head - span);
  const logs = (await rpc("eth_getLogs", [{
    address: ADDR.vault, fromBlock: "0x" + from.toString(16), toBlock: "latest",
    topics: [[TOPIC.Deposit, TOPIC.Withdraw, TOPIC.RedeemedInKind]],
  }], f)) as { blockNumber: string; transactionHash: string; topics: string[]; data: string }[];
  return logs.map((l) => {
    const w = words(l.data);
    const t0 = l.topics[0];
    const kind: Flow["kind"] = t0 === TOPIC.Deposit ? "deposit" : t0 === TOPIC.Withdraw ? "withdraw" : "redeemInKind";
    const owner = "0x" + (kind === "withdraw" ? l.topics[3] : kind === "deposit" ? l.topics[2] : l.topics[1]).slice(26);
    const assets = kind === "redeemInKind" ? w[1] : w[0];
    const shares = kind === "redeemInKind" ? w[0] : w[1];
    return { block: Number(BigInt(l.blockNumber)), tx: l.transactionHash, kind, owner, assets: assets.toString(), shares: shares.toString() };
  }).reverse();
}

export async function readHolder(addr: string, f?: typeof fetch) {
  const shares = await u(ADDR.vault, SEL.balanceOf + addrWord(addr), f);
  const value = shares === 0n ? 0n : await u(ADDR.vault, SEL.convertToAssets + word(shares), f);
  const maxWithdraw = await u(ADDR.vault, SEL.maxWithdraw + addrWord(addr), f);
  const usdg = await u(ADDR.usdg, SEL.balanceOf + addrWord(addr), f);
  const session = await readSession(addr, f);
  return { shares: shares.toString(), value: value.toString(), maxWithdraw: maxWithdraw.toString(), usdg: usdg.toString(), session };
}

export const fmtUsdg = (v: string | bigint, d = 2) => (Number(BigInt(v)) / 1e6).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtE18 = (v: string | bigint, d = 2) => (Number(BigInt(v)) / 1e18).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtUnits = (v: string | bigint) => (Number(BigInt(v)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 });
export const bps = (b: number) => `${(b / 100).toFixed(b % 100 ? 2 : 0)}%`;
