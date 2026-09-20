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
      const trades = await readTrades();
      const flows = await readFlows();
      return ok({ ok: true, at: Date.now(), trades, flows }, 30);
    }
    if (q.get("holder")) {
      const addr = q.get("holder")!;
      if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return NextResponse.json({ ok: false, error: "bad address" }, { status: 400 });
      const holder = await readHolder(addr);
      return NextResponse.json({ ok: true, at: Date.now(), holder }, { headers: { "cache-control": "no-store" } });
    }
    // sequential: the public RPC rate-limits parallel bursts
    const caps = await readCaps();
    const session = await readSession(ADDR.agent);
    const registry = await readRegistry();
    const vault = await readVault();
    const markets = await readMarkets();
    const positions = await readPositions(BigInt(vault.totalAssets));
    return ok({ ok: true, at: Date.now(), caps, session, registry, vault, markets, positions, addr: ADDR, block: DEPLOYMENT.block });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "chain unreachable" }, { status: 502 });
  }
}
