"use client";

import { useEffect, useRef, useState } from "react";
import "./trade.css";
import { useWallet, calldata, short, txUrl, addrUrl, type TradeTuple } from "@/lib/wallet";
import { bps, fmtE18, fmtUnits, fmtUsdg, STOCK_TOKENS, VIOLATION_TEXT, type Violation } from "@/lib/chain";
import { useChain, useHistory, useHolder, useToasts, type ChainData } from "./use-chain";

type Preview = {
  ok: true; violation: Violation; token: string; isBuy: boolean; amount: number; twapE18: string; spotE18: string;
  quote: string; quoteError?: string; minAmountOut: string; tuple: TradeTuple;
};

const pct = (a: bigint, b: bigint) => (b === 0n ? 0 : Number((a * 10_000n) / b) / 100);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function TradeTerminal() {
  const w = useWallet();
  const { data, err, refresh } = useChain();
  const { history, refresh: refreshHistory } = useHistory();
  const { holder, refresh: refreshHolder } = useHolder(w.account);
  const { toasts, push, dismiss } = useToasts();

  const [ticker, setTicker] = useState("NVDA");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [stopPct, setStopPct] = useState(5);
  const [slipBps, setSlipBps] = useState(100);
  const [leftSide, setLeftSide] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"positions" | "trades" | "flows">("positions");
  const [vaultTab, setVaultTab] = useState<"deposit" | "withdraw">("deposit");
  const [vAmount, setVAmount] = useState("");

  const market = data?.markets.find((m) => m.ticker === ticker);
  const position = data?.positions.find((p) => p.ticker === ticker);
  const nav = BigInt(data?.vault.totalAssets ?? "0");
  const isAgent = !!w.account && !!data && w.account.toLowerCase() === data.addr.agent.toLowerCase();
  const mySession = holder?.session;
  const canTrade = !!mySession?.live;

  // live preview, debounced
  const seq = useRef(0);
  useEffect(() => {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setPreview(null); return; }
    const id = ++seq.current;
    setPreviewing(true);
    const t = setTimeout(async () => {
      try {
        const stop = side === "buy" ? (1 - stopPct / 100).toFixed(4) : "0";
        const r = await fetch(`/api/chain?preview=1&token=${ticker}&side=${side}&amount=${amt}&stop=${stop}&slip=${slipBps}&left=${leftSide ? 1 : 0}`, { cache: "no-store" });
        const j = await r.json();
        if (id === seq.current && j.ok) setPreview(j);
      } finally { if (id === seq.current) setPreviewing(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [amount, side, ticker, stopPct, slipBps, leftSide]);

  const afterTx = async (label: string, hash: string) => {
    push({ kind: "info", title: `${label} sent`, body: "Waiting for confirmation…", href: txUrl(hash) });
    const r = await w.wait(hash);
    push({ kind: r.status ? "ok" : "err", title: r.status ? `${label} confirmed` : `${label} reverted`, href: txUrl(hash) });
    await Promise.all([refresh(), refreshHistory(), refreshHolder()]);
    return r.status;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); }
    catch (e) { push({ kind: "err", title: `${label} failed`, body: (e as Error).message?.slice(0, 220) }); }
    finally { setBusy(null); }
  };

  const execute = () => run("Order", async () => {
    if (!preview || preview.violation !== "None") throw new Error("the vault would refuse this order");
    if (!w.onChain) { await w.switchChain(); return; }
    const hash = await w.send(w.executor, calldata.execute(preview.tuple));
    const ok = await afterTx(`${side.toUpperCase()} ${ticker}`, hash);
    if (ok) { setAmount(""); setPreview(null); }
  });

  const deposit = () => run("Deposit", async () => {
    const a = BigInt(Math.round(Number(vAmount) * 1e6));
    if (a <= 0n) throw new Error("enter an amount");
    if (!w.onChain) { await w.switchChain(); return; }
    const h1 = await w.send(w.usdg, calldata.approve(w.vault, a));
    if (!(await afterTx("Approve USDG", h1))) return;
    const h2 = await w.send(w.vault, calldata.deposit(a, w.account!));
    if (await afterTx("Deposit", h2)) setVAmount("");
  });

  const withdraw = () => run("Withdraw", async () => {
    const a = BigInt(Math.round(Number(vAmount) * 1e6));
    if (a <= 0n) throw new Error("enter an amount");
    if (!w.onChain) { await w.switchChain(); return; }
    const h = await w.send(w.vault, calldata.withdraw(a, w.account!, w.account!));
    if (await afterTx("Withdraw", h)) setVAmount("");
  });

  const redeemAll = () => run("Redeem in kind", async () => {
    const s = BigInt(holder?.shares ?? "0");
    if (s <= 0n) throw new Error("no shares");
    if (!w.onChain) { await w.switchChain(); return; }
    const h = await w.send(w.vault, calldata.redeemInKind(s, w.account!));
    await afterTx("Redeem in kind", h);
  });

  const maxBuy = data ? Number((nav * BigInt(data.caps.perTradeBps)) / 10_000n) / 1e6 : 0;
  const twapNum = market ? Number(BigInt(market.twapE18)) / 1e18 : 0;
  const spotNum = market ? Number(BigInt(market.spotE18)) / 1e18 : 0;
  const dev = twapNum ? ((spotNum - twapNum) / twapNum) * 100 : 0;

  return (
    <section className="tt">
      <div className="wrap">
        {/* ── header ── */}
        <div className="tt-top">
          <div>
            <span className="eyebrow">// TRADE · ROBINHOOD CHAIN 4663 · EVERY ORDER ANSWERS THE VAULT</span>
            <h1>The <em>desk</em>, on chain.</h1>
            <p>
              Tokenized stocks through an ERC-4626 vault that reverts any order breaching its written caps.
              Compose an order and the vault tells you its verdict before you sign. Reads are live from mainnet;
              writes go through your wallet.
            </p>
          </div>
          <div className="tt-wallet">
            <span className={`tt-pill ${err && !data ? "bad" : err ? "" : data ? "ok" : ""}`} title={err ?? undefined}>
              <span className="dot" />{data ? (err ? `last read ${new Date(data.at).toISOString().slice(11, 19)}Z · ${err}` : `synced ${new Date(data.at).toISOString().slice(11, 19)}Z`) : err ? "chain unreachable" : "reading…"}
            </span>
            {w.account ? (
              <>
                <span className={`tt-pill ${w.onChain ? "ok" : "bad"}`}><span className="dot" />{w.onChain ? "chain 4663" : `wrong chain (${w.chainId ?? "?"})`}</span>
                {!w.onChain && <button className="tt-btn sm" onClick={w.switchChain}>Switch to Robinhood Chain</button>}
                <a className="tt-pill" href={addrUrl(w.account)} target="_blank" rel="noreferrer">{short(w.account)}{isAgent ? " · AGENT" : canTrade ? " · SESSION" : ""}</a>
              </>
            ) : (
              <button className="tt-btn lime" onClick={w.connect} disabled={w.connecting}>{w.connecting ? <span className="tt-spin" /> : null} Connect wallet</button>
            )}
          </div>
        </div>
        {w.error && <div className="tt-warn" style={{ marginBottom: 16 }}><b>Wallet:</b> {w.error}</div>}
        {data?.vault.paused && <div className="tt-warn" style={{ marginBottom: 16 }}><b>Vault paused.</b> Deposits and orders are refused; redeemInKind still works.</div>}

        {/* ── markets ── */}
        <div className="tt-strip">
          {(data?.markets ?? STOCK_TOKENS.map((t) => ({ ...t, twapE18: "0", spotE18: "0" }))).map((m) => {
            const tw = Number(BigInt(m.twapE18)) / 1e18, sp = Number(BigInt(m.spotE18)) / 1e18;
            const d = tw ? ((sp - tw) / tw) * 100 : 0;
            const pos = data?.positions.find((p) => p.ticker === m.ticker);
            return (
              <button key={m.ticker} className={`tt-mkt ${ticker === m.ticker ? "on" : ""}`} onClick={() => setTicker(m.ticker)}>
                <span className="t">{m.ticker}</span><span className="n">{m.name}</span>
                <div className="p">{tw ? `$${tw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</div>
                <div className="s">
                  <span>TWAP 5m</span>
                  <span className={d >= 0 ? "up" : "dn"}>spot {d >= 0 ? "+" : ""}{d.toFixed(2)}%</span>
                  {pos && <span style={{ marginLeft: "auto", color: "var(--lime)" }}>{pct(BigInt(pos.valueUsdg), nav).toFixed(1)}% held</span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="tt-grid">
          {/* ── left column ── */}
          <div className="tt-col">
            <div className="tt-card">
              <div className="tt-kpis">
                <div className="tt-kpi"><div className="l">Vault NAV</div><div className="v">${data ? fmtUsdg(data.vault.totalAssets) : "—"}</div><div className="sub">cap ${data ? fmtUsdg(data.vault.depositCap, 0) : "—"} USDG · {data ? pct(nav, BigInt(data.vault.depositCap)).toFixed(1) : "0"}% filled</div></div>
                <div className="tt-kpi"><div className="l">Cash</div><div className="v">${data ? fmtUsdg(data.vault.usdgBalance) : "—"}</div><div className="sub">{data ? pct(BigInt(data.vault.usdgBalance), nav).toFixed(1) : "0"}% of NAV · buffer {data ? bps(data.caps.cashBufferBps) : "—"}</div></div>
                <div className="tt-kpi"><div className="l">Share price</div><div className="v">${data ? fmtUsdg(data.vault.sharePriceE6, 4) : "—"}</div><div className="sub">vSPHYNX · supply {data ? (Number(BigInt(data.vault.totalSupply)) / 1e12).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</div></div>
                <div className="tt-kpi"><div className="l">Orders today</div><div className="v">{data?.vault.ordersToday ?? "—"}<small>/ {data?.caps.maxDailyOrders ?? "—"}</small></div><div className="sub">{data?.vault.openPositions ?? 0} open · max {data?.caps.maxOpenPositions ?? "—"}</div></div>
              </div>
            </div>

            <div className="tt-card">
              <div className="tt-card-h">
                Book
                <div className="tt-tabs">
                  <button className={tab === "positions" ? "on" : ""} onClick={() => setTab("positions")}>Positions</button>
                  <button className={tab === "trades" ? "on" : ""} onClick={() => setTab("trades")}>Trades</button>
                  <button className={tab === "flows" ? "on" : ""} onClick={() => setTab("flows")}>Deposits</button>
                </div>
              </div>
              {tab === "positions" && (
                data && data.positions.length ? (
                  <table className="tt-table">
                    <thead><tr><th>Token</th><th className="r">Units</th><th className="r">Avg cost</th><th className="r">Mark</th><th className="r">Value</th><th className="r">P&amp;L</th><th>Weight</th><th className="r">Stop</th></tr></thead>
                    <tbody>
                      {data.positions.map((p) => {
                        const m = data.markets.find((x) => x.ticker === p.ticker);
                        const pnl = BigInt(p.pnlUsdg);
                        return (
                          <tr key={p.ticker}>
                            <td><span className="tk">{p.ticker}</span></td>
                            <td className="r">{fmtUnits(p.units)}</td>
                            <td className="r">${fmtE18(p.avgCostE18)}</td>
                            <td className="r">${m ? fmtE18(m.twapE18) : "—"}</td>
                            <td className="r">${fmtUsdg(p.valueUsdg)}</td>
                            <td className={`r ${pnl >= 0n ? "up" : "dn"}`}>{pnl >= 0n ? "+" : "−"}${fmtUsdg(pnl < 0n ? -pnl : pnl)}</td>
                            <td><div className="tt-bar"><i style={{ width: `${clamp(p.weightBps / 100, 0, 100)}%` }} /></div><span style={{ fontSize: 11, color: "var(--ink-2)" }}>{(p.weightBps / 100).toFixed(1)}%</span></td>
                            <td className="r">{BigInt(p.stopPriceE18) > 0n ? `$${fmtE18(p.stopPriceE18)}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : <div className="tt-empty">{data ? "No open positions. The book is all cash." : err ? "Chain unreachable." : "Reading…"}</div>
              )}
              {tab === "trades" && (
                history && history.trades.length ? (
                  <table className="tt-table">
                    <thead><tr><th>Side</th><th>Token</th><th className="r">In</th><th className="r">Out</th><th className="r">Price</th><th className="r">NAV after</th><th className="r">Tx</th></tr></thead>
                    <tbody>
                      {history.trades.map((t) => (
                        <tr key={t.tx}>
                          <td><span className={`tt-side ${t.isBuy ? "buy" : "sell"}`}>{t.isBuy ? "BUY" : "SELL"}</span></td>
                          <td><span className="tk">{t.ticker}</span></td>
                          <td className="r">{t.isBuy ? `$${fmtUsdg(t.amountIn)}` : fmtUnits(t.amountIn)}</td>
                          <td className="r">{t.isBuy ? fmtUnits(t.amountOut) : `$${fmtUsdg(t.amountOut)}`}</td>
                          <td className="r">${fmtE18(t.priceE18)}</td>
                          <td className="r">${fmtUsdg(t.navAfter)}</td>
                          <td className="r"><a href={txUrl(t.tx)} target="_blank" rel="noreferrer">{t.tx.slice(0, 10)}… ↗</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="tt-empty">No trades yet. The first one goes on the record forever.</div>
              )}
              {tab === "flows" && (
                history && history.flows.length ? (
                  <table className="tt-table">
                    <thead><tr><th>Kind</th><th>Wallet</th><th className="r">USDG</th><th className="r">Shares</th><th className="r">Tx</th></tr></thead>
                    <tbody>
                      {history.flows.map((f) => (
                        <tr key={f.tx + f.kind}>
                          <td><span className={`tt-side ${f.kind === "deposit" ? "buy" : "sell"}`}>{f.kind.toUpperCase()}</span></td>
                          <td><a href={addrUrl(f.owner)} target="_blank" rel="noreferrer">{short(f.owner)}</a></td>
                          <td className="r">${fmtUsdg(f.assets)}</td>
                          <td className="r">{(Number(BigInt(f.shares)) / 1e12).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                          <td className="r"><a href={txUrl(f.tx)} target="_blank" rel="noreferrer">{f.tx.slice(0, 10)}… ↗</a></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <div className="tt-empty">No deposits yet.</div>
              )}
            </div>

            <CapsMeter data={data} />

            <div className="tt-card">
              <div className="tt-card-h">Session key · SessionKeyExecutor.sessions(agent)<span className="grow">{data ? short(data.addr.agent) : ""}</span></div>
              <div className="tt-card-b">
                {data ? <SessionPanel s={data.session} /> : <div className="tt-empty">Reading…</div>}
                <div className="tt-note">
                  The agent never holds a standing wallet over the book. Its session expires, is capped per trade and in total,
                  and a refused order spends none of it. Only the session holder can call <code>execute</code>; everyone else can preview.
                </div>
              </div>
            </div>
          </div>

          {/* ── right column: ticket + vault ── */}
          <div className="tt-col">
            <div className="tt-card">
              <div className="tt-card-h">Order ticket<span className="grow">{ticker} · {market ? `$${twapNum.toFixed(2)}` : "—"}</span></div>
              <div className="tt-card-b">
                <div className="tt-seg">
                  <button className={`buy ${side === "buy" ? "on" : ""}`} onClick={() => { setSide("buy"); setAmount(""); }}>BUY</button>
                  <button className={`sell ${side === "sell" ? "on" : ""}`} onClick={() => { setSide("sell"); setAmount(""); }}>SELL</button>
                </div>

                <div className="tt-field">
                  <label>
                    <span>{side === "buy" ? "Spend" : "Sell"}</span>
                    {side === "buy"
                      ? <b onClick={() => setAmount(maxBuy > 0 ? maxBuy.toFixed(2) : "")}>max {maxBuy.toLocaleString("en-US", { maximumFractionDigits: 0 })} USDG ({data ? bps(data.caps.perTradeBps) : "—"} of NAV)</b>
                      : <b onClick={() => setAmount(position ? (Number(BigInt(position.units)) / 1e18).toString() : "")}>held {position ? fmtUnits(position.units) : "0"} {ticker}</b>}
                  </label>
                  <div className="tt-input">
                    <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                    <span className="unit">{side === "buy" ? "USDG" : ticker}</span>
                  </div>
                  <div className="tt-quick">
                    {side === "buy"
                      ? [25, 50, 75, 100].map((p) => <button key={p} onClick={() => setAmount(((maxBuy * p) / 100).toFixed(2))}>{p}%</button>)
                      : [25, 50, 75, 100].map((p) => <button key={p} onClick={() => setAmount(position ? ((Number(BigInt(position.units)) / 1e18) * p / 100).toFixed(6) : "")}>{p}%</button>)}
                  </div>
                </div>

                {side === "buy" && (
                  <div className="tt-field">
                    <label><span>Stop below entry</span><b>{stopPct.toFixed(1)}% · ${(twapNum * (1 - stopPct / 100)).toFixed(2)} · cap {data ? bps(data.caps.stopLossBps) : "—"}</b></label>
                    <input className="tt-range" type="range" min={0.5} max={data ? data.caps.stopLossBps / 100 : 8} step={0.5} value={stopPct} onChange={(e) => setStopPct(Number(e.target.value))} />
                  </div>
                )}

                <div className="tt-row2">
                  <div className="tt-field">
                    <label><span>Max slippage</span><b>{(slipBps / 100).toFixed(2)}%</b></label>
                    <input className="tt-range" type="range" min={10} max={300} step={10} value={slipBps} onChange={(e) => setSlipBps(Number(e.target.value))} />
                  </div>
                  <div className="tt-field">
                    <label><span>Left-side plan</span></label>
                    <button className={`tt-btn sm ${leftSide ? "lime" : ""}`} style={{ width: "100%", justifyContent: "center" }} onClick={() => setLeftSide((x) => !x)}>{leftSide ? "Applies" : "Not applied"}</button>
                  </div>
                </div>

                <div className="tt-recv">
                  <div className="k"><span>Mark (TWAP 5m)</span><b>${twapNum.toFixed(2)}</b></div>
                  <div className="k"><span>Spot vs mark</span><b className={dev >= 0 ? "up" : "dn"} style={{ color: dev >= 0 ? "var(--up)" : "var(--dn)" }}>{dev >= 0 ? "+" : ""}{dev.toFixed(3)}%</b></div>
                  <div className="k big"><span>You receive (est.)</span><b>{preview && BigInt(preview.quote) > 0n ? (side === "buy" ? `${fmtUnits(preview.quote)} ${ticker}` : `$${fmtUsdg(preview.quote)}`) : "—"}</b></div>
                  <div className="k"><span>Min after slippage</span><b>{preview && BigInt(preview.minAmountOut) > 0n ? (side === "buy" ? `${fmtUnits(preview.minAmountOut)} ${ticker}` : `$${fmtUsdg(preview.minAmountOut)}`) : "—"}</b></div>
                  {preview?.quoteError && <div className="k"><span style={{ color: "var(--dn)" }}>quote: {preview.quoteError.slice(0, 60)}</span></div>}
                </div>

                <div className={`tt-verdict ${preview ? (preview.violation === "None" ? "pass" : "fail") : ""}`}>
                  <div className="ic">{previewing ? "…" : preview ? (preview.violation === "None" ? "✓" : "✕") : "?"}</div>
                  <div>
                    <div className="h">{previewing ? "asking the vault" : preview ? (preview.violation === "None" ? "previewTrade → None · allowed" : `previewTrade → ${preview.violation}`) : "previewTrade() · enter an amount"}</div>
                    <div className="d">{preview ? VIOLATION_TEXT[preview.violation] : "The vault names the exact rule an order would break before anyone signs. This is a view call: nothing is placed, nothing is spent."}</div>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  {!w.account ? (
                    <button className="tt-btn lime wide" onClick={w.connect}>Connect wallet to trade</button>
                  ) : !w.onChain ? (
                    <button className="tt-btn wide" onClick={w.switchChain}>Switch to Robinhood Chain</button>
                  ) : (
                    <button
                      className={`tt-btn wide ${side === "buy" ? "lime" : "red"}`}
                      disabled={!preview || preview.violation !== "None" || !!busy || !canTrade}
                      onClick={execute}
                    >
                      {busy === "Order" ? <span className="tt-spin" /> : null}
                      {!canTrade ? "No session for this wallet" : `${side === "buy" ? "Buy" : "Sell"} ${ticker} · sign in wallet`}
                    </button>
                  )}
                </div>
                {w.account && w.onChain && !canTrade && (
                  <div className="tt-warn" style={{ marginTop: 12 }}>
                    <b>This wallet holds no live session.</b> Only a session granted by the owner can call <code>execute</code>. You can still preview every order, deposit and withdraw. To get a session, <a href="/request-access" style={{ color: "var(--lime)" }}>request vault access</a> or read <a href="/docs/session-keys" style={{ color: "var(--lime)" }}>Session Keys</a>.
                  </div>
                )}
                <div className="tt-note">
                  Executes through <a href={addrUrl(w.executor)} target="_blank" rel="noreferrer">SessionKeyExecutor.execute()</a> → vault → Uniswap V3 pool. Reverts on any cap breach with the rule's name. Real money, unaudited.
                </div>
              </div>
            </div>

            <div className="tt-card">
              <div className="tt-card-h">
                Vault · vSPHYNX
                <div className="tt-tabs">
                  <button className={vaultTab === "deposit" ? "on" : ""} onClick={() => setVaultTab("deposit")}>Deposit</button>
                  <button className={vaultTab === "withdraw" ? "on" : ""} onClick={() => setVaultTab("withdraw")}>Withdraw</button>
                </div>
              </div>
              <div className="tt-card-b">
                <div className="tt-sess" style={{ marginBottom: 6 }}>
                  <div className="c"><div className="l">Your shares</div><div className="v">{holder ? (Number(BigInt(holder.shares)) / 1e12).toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—"}</div></div>
                  <div className="c"><div className="l">Worth</div><div className="v">${holder ? fmtUsdg(holder.value) : "—"}</div></div>
                  <div className="c"><div className="l">Wallet USDG</div><div className="v">${holder ? fmtUsdg(holder.usdg) : "—"}</div></div>
                  <div className="c"><div className="l">Cash withdrawable</div><div className="v">${holder ? fmtUsdg(holder.maxWithdraw) : "—"}</div></div>
                </div>
                <div className="tt-field">
                  <label>
                    <span>{vaultTab === "deposit" ? "Deposit USDG" : "Withdraw USDG"}</span>
                    <b onClick={() => setVAmount(holder ? (Number(BigInt(vaultTab === "deposit" ? holder.usdg : holder.maxWithdraw)) / 1e6).toFixed(2) : "")}>max</b>
                  </label>
                  <div className="tt-input">
                    <input inputMode="decimal" placeholder="0.00" value={vAmount} onChange={(e) => setVAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                    <span className="unit">USDG</span>
                  </div>
                </div>
                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  {!w.account ? (
                    <button className="tt-btn wide" onClick={w.connect}>Connect wallet</button>
                  ) : vaultTab === "deposit" ? (
                    <button className="tt-btn lime wide" disabled={!!busy || !vAmount} onClick={deposit}>{busy === "Deposit" ? <span className="tt-spin" /> : null} Approve + deposit</button>
                  ) : (
                    <>
                      <button className="tt-btn wide" disabled={!!busy || !vAmount} onClick={withdraw}>{busy === "Withdraw" ? <span className="tt-spin" /> : null} Withdraw cash</button>
                      <button className="tt-btn wide" disabled={!!busy || !holder || BigInt(holder.shares) === 0n} onClick={redeemAll}>{busy === "Redeem in kind" ? <span className="tt-spin" /> : null} Redeem all in kind</button>
                    </>
                  )}
                </div>
                <div className="tt-note">
                  Cash withdrawals are limited to USDG the vault holds. <b>Redeem in kind</b> hands you your pro-rata slice of cash and every token, always, even when paused.
                  Exit fee {data ? bps(data.vault.exitFeeBps) : "—"} stays with remaining holders. No management or performance fee.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tt-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`tt-toast ${t.kind}`}>
            <div className="ic">{t.kind === "ok" ? "✓" : t.kind === "err" ? "✕" : "…"}</div>
            <div><div>{t.title}</div>{t.body && <div style={{ color: "var(--ink-2)", fontSize: 12, marginTop: 2 }}>{t.body}</div>}{t.href && <a href={t.href} target="_blank" rel="noreferrer">view on explorer ↗</a>}</div>
            <button className="x" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function CapsMeter({ data }: { data: ChainData | null }) {
  if (!data) return null;
  const nav = BigInt(data.vault.totalAssets);
  const cash = BigInt(data.vault.usdgBalance);
  const topWeight = Math.max(0, ...data.positions.map((p) => p.weightBps));
  const dayOpen = BigInt(data.vault.dayOpenNav);
  const dayPnl = dayOpen > 0n ? Number(((nav - dayOpen) * 10_000n) / dayOpen) : 0; // bps
  const rows = [
    { l: "Per-trade cap", v: bps(data.caps.perTradeBps), fill: 0, note: `≤ $${fmtUsdg((nav * BigInt(data.caps.perTradeBps)) / 10_000n, 0)} per order` },
    { l: "Concentration", v: `${(topWeight / 100).toFixed(1)}% / ${bps(data.caps.maxConcentrationBps)}`, fill: topWeight / data.caps.maxConcentrationBps },
    { l: "Positions", v: `${data.vault.openPositions} / ${data.caps.maxOpenPositions}`, fill: data.vault.openPositions / data.caps.maxOpenPositions },
    { l: "Orders today", v: `${data.vault.ordersToday} / ${data.caps.maxDailyOrders}`, fill: data.vault.ordersToday / data.caps.maxDailyOrders },
    { l: "Cash buffer", v: `${pct(cash, nav).toFixed(1)}% / ${bps(data.caps.cashBufferBps)}`, fill: nav === 0n ? 0 : 1 - Math.max(0, pct(cash, nav) - data.caps.cashBufferBps / 100) / 100 },
    { l: "Day P&L vs halt", v: `${dayPnl >= 0 ? "+" : ""}${(dayPnl / 100).toFixed(2)}% / −${bps(data.caps.dailyLossHaltBps)}`, fill: dayPnl < 0 ? -dayPnl / data.caps.dailyLossHaltBps : 0 },
  ];
  return (
    <div className="tt-card">
      <div className="tt-card-h">Guardrails · GuardrailConfig.caps() · live headroom</div>
      <div className="tt-card-b">
        <div className="tt-caps">
          {rows.map((r) => (
            <div className="tt-cap" key={r.l}>
              <div className="l">{r.l}</div>
              <div className="v">{r.v}</div>
              <div className="m"><i className={r.fill >= 0.85 ? "hot" : ""} style={{ width: `${clamp(r.fill * 100, 0, 100)}%` }} /></div>
              {r.note && <div style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>{r.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionPanel({ s }: { s: ChainData["session"] }) {
  const left = Math.max(0, s.expiry - Date.now() / 1000);
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600);
  return (
    <div className="tt-sess">
      <div className="c"><div className="l">Status</div><div className="v" style={{ color: s.live ? "var(--up)" : "var(--dn)" }}>{s.live ? "LIVE" : s.active ? "EXHAUSTED / EXPIRED" : "NONE"}</div></div>
      <div className="c"><div className="l">Expires</div><div className="v">{left > 0 ? `${d}d ${h}h` : "expired"}</div></div>
      <div className="c"><div className="l">Per trade</div><div className="v">${fmtUsdg(s.maxNotionalPerTrade, 0)}</div></div>
      <div className="c"><div className="l">Trades</div><div className="v">{s.tradesUsed} / {s.maxTrades}</div></div>
      <div className="c"><div className="l">Budget</div><div className="v">${fmtUsdg(s.cumNotionalUsed, 0)} / ${fmtUsdg(s.maxCumNotional, 0)}</div></div>
      <div className="c"><div className="l">Sides</div><div className="v"><span style={{ color: s.buysAllowed ? "var(--up)" : "var(--dn)" }}>BUY</span> · <span style={{ color: s.sellsAllowed ? "var(--up)" : "var(--dn)" }}>SELL</span></div></div>
    </div>
  );
}
