import { NextRequest, NextResponse } from "next/server";
import { ADDR, previewTrade, readCaps, readRegistry, readSession, readVault, STOCK_TOKENS } from "@/lib/chain";

/**
 * Server-side reads from Robinhood Chain mainnet, cached ~30s. The browser never
 * talks to the RPC directly (CORS + no leaking the visitor's IP to the node).
 * GET  /api/chain            → caps, session, registry, vault
 * GET  /api/chain?preview=1&token=NVDA&side=buy&amount=1500&stop=1  → previewTrade()
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  try {
    if (q.get("preview")) {
      const tok = STOCK_TOKENS.find((t) => t.ticker === q.get("token")) ?? STOCK_TOKENS[0];
      const isBuy = q.get("side") !== "sell";
      const amount = Math.max(0, Math.min(1e9, Number(q.get("amount") ?? "0")));
      const hasStop = q.get("stop") === "1";
      const violation = await previewTrade({
        stockToken: tok.address,
        isBuy,
        // buys are quoted in USDG (6 dec); sells in stock-token units (18 dec)
        amountIn: isBuy ? BigInt(Math.round(amount * 1e6)) : BigInt(Math.round(amount)) * 10n ** 18n,
        minAmountOut: 0n,
        stopPriceE18: hasStop ? 10n ** 18n : 0n,
        leftSideException: false,
      });
      return NextResponse.json({ ok: true, violation, token: tok.ticker, isBuy, amount });
    }
    // sequential: the public RPC rate-limits parallel bursts
    const caps = await readCaps();
    const session = await readSession(ADDR.agent);
    const registry = await readRegistry();
    const vault = await readVault();
    return NextResponse.json({ ok: true, at: Date.now(), caps, session, registry, vault, addr: ADDR }, {
      headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "chain unreachable" }, { status: 502 });
  }
}
