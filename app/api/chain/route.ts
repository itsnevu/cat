import { NextRequest, NextResponse } from "next/server";
import {
  ADDR, DEPLOYMENT, previewTrade, quoteSwap, readCaps, readFlows, readHolder, readMarkets, readPositions,
  readRegistry, readSession, readTrades, readVault, tokenByTicker, STOCK_TOKENS,
} from "@/lib/chain";

/**
 * Server-side reads from Robinhood Chain mainnet. The browser never talks to the RPC directly
 * (CORS + no leaking the visitor's IP to the node).
 *
 * GET /api/chain                                  -> caps, session, registry, vault, markets, positions
 * GET /api/chain?trades=1                         -> TradeExecuted + deposit/withdraw history
 * GET /api/chain?holder=0x...                     -> one wallet's shares, value, USDG balance, session
 * GET /api/chain?preview=1&token=NVDA&side=buy&amount=1500&stop=0.95&slip=100
 *     amount: USDG for buys, token units for sells; stop: fraction of TWAP (buys) or stopE18 absolute
 *     -> previewTrade() verdict + swap quote + minOut + the exact tuple to sign
 */
export const dynamic = "force-dynamic";

const ok = (body: unknown, maxAge = 20) =>
  NextResponse.json(body, { headers: { "cache-control": `public, s-maxage=${maxAge}, stale-while-revalidate=120` } });

/**
 * Last-good snapshots. The public RPC rate-limits bursts; when a read fails we serve the previous
 * answer with `stale: true` and its age instead of a 502, so the pages never go blank.
 */
type Snap = { at: number; body: Record<string, unknown> };
const last: { summary?: Snap; trades?: Snap } = {};
const STALE_OK_MS = 30 * 60_000;
const withStale = (key: keyof typeof last, e: unknown) => {
  const s = last[key];
  const msg = e instanceof Error ? e.message : "chain unreachable";
  if (s && Date.now() - s.at < STALE_OK_MS) {
    return NextResponse.json({ ...s.body, stale: true, staleFor: Date.now() - s.at, error: msg }, { headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ ok: false, error: msg }, { status: 502 });
};

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    if (q.get("preview")) {
      const tok = tokenByTicker(q.get("token") ?? "NVDA") ?? STOCK_TOKENS[0];
      const isBuy = q.get("side") !== "sell";
      const amount = Math.max(0, Math.min(1e9, Number(q.get("amount") ?? "0")));
      const slipBps = Math.max(0, Math.min(2000, Number(q.get("slip") ?? "100")));
      const leftSide = q.get("left") === "1";
      const markets = await readMarkets();
      const m = markets.find((x) => x.ticker === tok.ticker)!;
      const twap = BigInt(m.twapE18);
      let stopPriceE18 = 0n;
      if (isBuy) {
        if (q.get("stopE18")) stopPriceE18 = BigInt(q.get("stopE18")!);
        else {
          const frac = Number(q.get("stop") ?? "0.95");
          stopPriceE18 = frac > 0 ? (twap * BigInt(Math.round(frac * 1e6))) / 1_000_000n : 0n;
        }
      }
      const amountIn = isBuy ? BigInt(Math.round(amount * 1e6)) : BigInt(Math.round(amount * 1e6)) * 10n ** 12n;
      let quote = 0n; let quoteError: string | undefined;
      try {
        quote = amountIn === 0n ? 0n : await quoteSwap(isBuy ? ADDR.usdg : tok.address, isBuy ? tok.address : ADDR.usdg, amountIn);
      } catch (e) { quoteError = e instanceof Error ? e.message : "quote failed"; }
      const minAmountOut = (quote * BigInt(10_000 - slipBps)) / 10_000n;
      const trade = { stockToken: tok.address, isBuy, amountIn, minAmountOut, stopPriceE18, leftSideException: leftSide };
      const violation = await previewTrade(trade);
      return NextResponse.json({
        ok: true, violation, token: tok.ticker, isBuy, amount, twapE18: m.twapE18, spotE18: m.spotE18,
        quote: quote.toString(), quoteError, minAmountOut: minAmountOut.toString(),
        tuple: {
          stockToken: tok.address, isBuy, amountIn: amountIn.toString(), minAmountOut: minAmountOut.toString(),
          stopPriceE18: stopPriceE18.toString(), leftSideException: leftSide,
        },
      }, { headers: { "cache-control": "no-store" } });
    }
    if (q.get("trades")) {
      try {
        const trades = await readTrades();
        const flows = await readFlows();
        const body = { ok: true, at: Date.now(), trades, flows };
        last.trades = { at: Date.now(), body };
        return ok(body, 30);
      } catch (e) { return withStale("trades", e); }
    }
    if (q.get("holder")) {
      const addr = q.get("holder")!;
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
      const holder = await readHolder(addr);
      return NextResponse.json({ ok: true, at: Date.now(), holder }, { headers: { "cache-control": "no-store" } });
    }
    // sequential: the public RPC rate-limits parallel bursts
    try {
      const caps = await readCaps();
      const session = await readSession(ADDR.agent);
      const registry = await readRegistry();
      const vault = await readVault();
      const markets = await readMarkets();
      const positions = await readPositions(BigInt(vault.totalAssets));
      const body = { ok: true, at: Date.now(), caps, session, registry, vault, markets, positions, addr: ADDR, block: DEPLOYMENT.block };
      last.summary = { at: Date.now(), body };
      return ok(body);
    } catch (e) { return withStale("summary", e); }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "chain unreachable" }, { status: 502 });
  }
}
