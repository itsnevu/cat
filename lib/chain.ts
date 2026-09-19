/**
 * Minimal, dependency-free reads from the SPHYNX contracts on Robinhood Chain
 * mainnet (chainId 4663). Everything here is a `view` call — nothing signs,
 * nothing spends. Selectors are precomputed (cast sig) so no ABI lib is needed.
 * Addresses mirror onchain/deployments/latest.json, verified by direct call.
 */
export const CHAIN_ID = 4663;
export const RPC_URL = process.env.RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";

export const ADDR = {
  vault: "0x0e500E390cC599055f1e54194e1e611Cf64c5047",
  guardrailConfig: "0x68cf24994d0363Be7688e96B69dDacC290c766C0",
  executor: "0xC1C00ED38A41a00Cbbf89be8A4552c1a16706AF7",
  deskRegistry: "0x68cc84d722E2d613cAc36c62167B177656e2C983",
  safe: "0x47b5e2923216f203b7960d8D232215534AF02FF2",
  agent: "0xF4B68286ba3cDb4b26A4a3075765177111Cff661",
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
} as const;

/** DeskRegistry subject seeded at deploy: subjectFor(deployer, keccak("aelix-vault:" ‖ vault)). */
export const REGISTRY_SUBJECT = "0x970c5c41a5e7b41b93b98d8a7028b22b1b839218d30d014bd1da9c3d4eb85ac4";

/** Stock Tokens on the vault allowlist (18 decimals, price-tracking, not shares). */
export const STOCK_TOKENS: { ticker: string; address: string }[] = [
  { ticker: "AAPL", address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9" },
  { ticker: "AMD", address: "0x86923f96303D656E4aa86D9d42D1e57ad2023fdC" },
  { ticker: "AMZN", address: "0x12f190a9F9d7D37a250758b26824B97CE941bF54" },
  { ticker: "GOOGL", address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3" },
  { ticker: "NVDA", address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC" },
  { ticker: "SPY", address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C" },
  { ticker: "GME", address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E" },
];

const SEL = {
  caps: "0x18e22d98", //           GuardrailConfig.caps()
  count: "0x7937354c", //          DeskRegistry.count(bytes32)
  at: "0x72ec86a8", //             DeskRegistry.at(bytes32,uint256)
  sessions: "0x431a1b97", //       SessionKeyExecutor.sessions(address)
  previewTrade: "0x266d144e", //   RWAVault.previewTrade((address,bool,uint256,uint256,uint256,bool))
  depositCap: "0xdbd5edc7", //     RWAVault.depositCap()
  totalAssets: "0x01e1d114", //    RWAVault.totalAssets()
  paused: "0x5c975abb", //         RWAVault.paused()
  isAllowed: "0xbabcc539", //      RWAVault.isAllowed(address)
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
  MissingStop: "Buys must carry a real stop below market.",
  NotAllowed: "Token is not on the vault allowlist.",
  ZeroAmount: "Order amount is zero.",
  InsufficientPosition: "Sell exceeds the held balance.",
  Paused: "The vault is paused.",
};

const pad = (hex: string, bytes = 32) => hex.replace(/^0x/, "").padStart(bytes * 2, "0");
const word = (n: bigint) => pad(n.toString(16));
const addrWord = (a: string) => pad(a.toLowerCase());
const boolWord = (b: boolean) => word(b ? 1n : 0n);

export async function ethCall(to: string, data: string, fetchImpl: typeof fetch = fetch, attempt = 0): Promise<string> {
  const res = await fetchImpl(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    // server-side callers get a short cache; the browser never calls this directly
    next: { revalidate: 30 },
  } as RequestInit);
  // the public node rate-limits bursts; back off briefly and retry a couple of times
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    return ethCall(to, data, fetchImpl, attempt + 1);
  }
  const json = (await res.json()) as { result?: string; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result ?? "0x";
}

/** Split a return blob into 32-byte words as bigints. */
export function words(hex: string): bigint[] {
  const h = hex.replace(/^0x/, "");
  const out: bigint[] = [];
  for (let i = 0; i + 64 <= h.length; i += 64) out.push(BigInt("0x" + h.slice(i, i + 64)));
  return out;
}

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
  maxCumNotional: string; cumNotionalUsed: string; buysAllowed: boolean; sellsAllowed: boolean;
};
export async function readSession(agent: string, f?: typeof fetch): Promise<Session> {
  const w = words(await ethCall(ADDR.executor, SEL.sessions + addrWord(agent), f));
  return {
    active: w[0] === 1n, expiry: Number(w[1]), maxNotionalPerTrade: w[2].toString(), maxTrades: Number(w[3]),
    tradesUsed: Number(w[4]), maxCumNotional: w[5].toString(), cumNotionalUsed: w[6].toString(),
    buysAllowed: w[7] === 1n, sellsAllowed: w[8] === 1n,
  };
}

export type Attestation = { epoch: number; timestamp: number; nav: string; realizedPnl: string; snapshotHash: string; uri: string };
export async function readRegistry(f?: typeof fetch): Promise<{ count: number; latest: Attestation[] }> {
  const count = Number(words(await ethCall(ADDR.deskRegistry, SEL.count + REGISTRY_SUBJECT.slice(2), f))[0] ?? 0n);
  const latest: Attestation[] = [];
  for (let i = Math.max(0, count - 8); i < count; i++) {
    const raw = await ethCall(ADDR.deskRegistry, SEL.at + REGISTRY_SUBJECT.slice(2) + word(BigInt(i)), f);
    const h = raw.replace(/^0x/, "");
    // struct with one dynamic member is returned behind a head offset
    const off = Number(BigInt("0x" + h.slice(0, 64))) * 2;
    const w = words("0x" + h.slice(off));
    const nav = w[2]; const pnl = BigInt.asIntN(256, w[3]);
    const uriOff = Number(w[5]) * 2; const uriLen = Number(BigInt("0x" + h.slice(off + uriOff, off + uriOff + 64)));
    const uriHex = h.slice(off + uriOff + 64, off + uriOff + 64 + uriLen * 2);
    const uri = Buffer.from(uriHex, "hex").toString("utf8");
    latest.push({ epoch: Number(w[0]), timestamp: Number(w[1]), nav: nav.toString(), realizedPnl: pnl.toString(), snapshotHash: "0x" + w[4].toString(16).padStart(64, "0"), uri });
  }
  return { count, latest };
}

export type VaultState = { depositCap: string; totalAssets: string; paused: boolean };
export async function readVault(f?: typeof fetch): Promise<VaultState> {
  const cap = await ethCall(ADDR.vault, SEL.depositCap, f);
  const assets = await ethCall(ADDR.vault, SEL.totalAssets, f);
  const paused = await ethCall(ADDR.vault, SEL.paused, f);
  return { depositCap: words(cap)[0].toString(), totalAssets: words(assets)[0].toString(), paused: words(paused)[0] === 1n };
}

export type PreviewInput = { stockToken: string; isBuy: boolean; amountIn: bigint; minAmountOut: bigint; stopPriceE18: bigint; leftSideException: boolean };
export async function previewTrade(o: PreviewInput, f?: typeof fetch): Promise<Violation> {
  const data = SEL.previewTrade + addrWord(o.stockToken) + boolWord(o.isBuy) + word(o.amountIn) + word(o.minAmountOut) + word(o.stopPriceE18) + boolWord(o.leftSideException);
  const idx = Number(words(await ethCall(ADDR.vault, data, f))[0] ?? 0n);
  return VIOLATIONS[idx] ?? "None";
}

export const fmtUsdg = (v: string) => (Number(BigInt(v)) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });
export const bps = (b: number) => `${(b / 100).toFixed(b % 100 ? 2 : 0)}%`;
