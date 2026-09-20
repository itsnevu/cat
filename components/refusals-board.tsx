"use client";

import { useEffect, useMemo, useState } from "react";
import { PixelSphynx } from "@/components/ui/pixel-sphynx";
import { Reveal } from "@/components/ui/reveal";
import { bps, fmtE18, fmtUnits, fmtUsdg, STOCK_TOKENS, VIOLATION_TEXT, EXPLORER, type Violation } from "@/lib/chain";
import { useChain, useHistory } from "@/components/trade/use-chain";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now() / 1000); const id = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(id); }, []);
  if (now === null) return <span className="tg lime">…</span>;
  const left = Math.max(0, to - now);
  if (left === 0) return <span className="tg red">EXPIRED</span>;
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60);
  return <span className="tg lime" style={{ fontVariantNumeric: "tabular-nums" }}>{d}d {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>;
}

const Sk = ({ w = "60%" }: { w?: string }) => <span style={{ display: "inline-block", width: w, height: "0.8em", borderRadius: 6, background: "rgba(243,233,210,.08)", verticalAlign: "middle" }} />;

type Preview = { ok: true; violation: Violation; quote: string; minAmountOut: string; twapE18: string };

export function RefusalsBoard() {
  const { data, err } = useChain(45_000);
  const { history } = useHistory(90_000);
  const [token, setToken] = useState("NVDA");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("1500");
  const [stopPct, setStopPct] = useState(5);
  const [verdict, setVerdict] = useState<Preview | null>(null);
  const [asking, setAsking] = useState(false);
  const [refusedHere, setRefusedHere] = useState(0);
  const [askedHere, setAskedHere] = useState(0);

  const ask = async () => {
    setAsking(true);
    try {
      const stop = side === "buy" ? (1 - stopPct / 100).toFixed(4) : "0";
      const r = await fetch(`/api/chain?preview=1&token=${token}&side=${side}&amount=${Number(amount) || 0}&stop=${stop}`, { cache: "no-store" });
      const j = await r.json();
      if (j.ok) { setVerdict(j); setAskedHere((n) => n + 1); if (j.violation !== "None") setRefusedHere((n) => n + 1); }
      else setVerdict({ ok: true, violation: "Paused", quote: "0", minAmountOut: "0", twapE18: "0" });
    } finally { setAsking(false); }
  };

  const capRows = useMemo(() => data ? [
    ["Per-trade cap", bps(data.caps.perTradeBps), "of NAV per order"],
    ["Max concentration", bps(data.caps.maxConcentrationBps), "in one symbol"],
    ["Max open positions", String(data.caps.maxOpenPositions), "distinct names"],
    ["Max daily orders", String(data.caps.maxDailyOrders), "buys + sells, UTC day"],
    ["Required stop", bps(data.caps.stopLossBps), "max depth below entry, every buy"],
    ["Daily loss halt", bps(data.caps.dailyLossHaltBps), "day drawdown — buys freeze"],
    ["Cash buffer", bps(data.caps.cashBufferBps), "of NAV kept in USDG"],
  ] : [
    ["Per-trade cap", "", "of NAV per order"], ["Max concentration", "", "in one symbol"], ["Max open positions", "", "distinct names"],
    ["Max daily orders", "", "buys + sells, UTC day"], ["Required stop", "", "max depth below entry, every buy"],
    ["Daily loss halt", "", "day drawdown — buys freeze"], ["Cash buffer", "", "of NAV kept in USDG"],
  ], [data]);

  const twap = data?.markets.find((m) => m.ticker === token)?.twapE18;

  return (
    <>
      {/* ── counter ── */}
      <section className="sec dark" id="refusals" style={{ paddingTop: 140 }}>
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">// WE PUBLISH OUR NO&rsquo;S · LIVE FROM CHAIN 4663</span>
              <h2>The Sphinx said no.</h2>
            </div>
            <p>
              Everyone posts their wins. This page reads the SPHYNX contracts on Robinhood Chain mainnet
              directly — no database, nothing editable by us — and shows what they refuse.
            </p>
          </div>
          <Reveal className="stats stats--4">
            <div className="stat">
              <div className="v">{data ? data.registry.count : <Sk w="40%" />}</div>
              <div className="l">Attestations on the append-only record</div>
            </div>
            <div className="stat">
              <div className="v">{data ? `$${fmtUsdg(data.vault.totalAssets, 0)}` : <Sk />}</div>
              <div className="l">Vault NAV (USDG) · cap ${data ? fmtUsdg(data.vault.depositCap, 0) : "…"}</div>
            </div>
            <div className="stat">
              <div className="v">{history ? history.trades.length : <Sk w="40%" />}</div>
              <div className="l">Orders the vault has filled, ever</div>
            </div>
            <div className="stat">
              <div className="v">{refusedHere}<span style={{ opacity: 0.4, fontSize: "0.5em" }}> / {askedHere}</span></div>
              <div className="l">Refusals you triggered below (preview only)</div>
            </div>
          </Reveal>
          <p className="eyebrow" style={{ marginTop: 18 }}>
            {data ? `READ ${new Date(data.at).toISOString().slice(11, 19)}Z · REFRESHES EVERY 45S` : err ? `CHAIN UNREACHABLE · ${err}` : "READING…"}
            {err && data ? ` · ${err.toUpperCase()}` : ""}
            {" · "}UNAUDITED · NO TIMELOCK · <a href="/trade" style={{ color: "inherit", textDecoration: "underline" }}>TRADE AT /TRADE</a>
          </p>
          {data && data.registry.latest.length > 0 && (
            <div className="term" style={{ marginTop: 28, padding: 20, minHeight: 0 }}>
              {data.registry.latest.map((a) => (
                <div key={a.epoch} className="term-line">
                  <span className="tg lime">EPOCH {a.epoch}</span> <span className="tg cmd">{new Date(a.timestamp * 1000).toISOString()}</span>{" "}
                  nav ${fmtUsdg(a.nav)} · pnl {BigInt(a.realizedPnl) < 0n ? "−" : ""}${fmtUsdg(BigInt(a.realizedPnl) < 0n ? -BigInt(a.realizedPnl) : a.realizedPnl)} · {a.uri || a.snapshotHash.slice(0, 18) + "…"}
                </div>
              ))}
              <div className="term-line" style={{ opacity: 0.5 }}><span className="tg cmd">$</span> every desk run will append one · refusals and vetoes go on this record and cannot be pruned</div>
            </div>
          )}
        </div>
      </section>

      {/* ── rules carved in stone ── */}
      <section className="sec" id="rules">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">// READ THE RULES · GuardrailConfig.caps()</span>
              <h2>Its limits, read from the contract.</h2>
            </div>
            <p>
              These are the caps the vault enforces on every swap — read live from{" "}
              {data ? <a href={addrUrl(data.addr.guardrailConfig)} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{short(data.addr.guardrailConfig)}</a> : "the contract"},
              not from our copy. Only the owner can change one, within hard ceilings nobody can widen; there is no timelock yet.
            </p>
          </div>
          <div className="guards">
            {capRows.map(([k, v, note], i) => (
              <Reveal key={k} delay={i * 40} className="guard">
                <h3><span className="b" /> {k}</h3>
                <div className="stat" style={{ padding: "10px 0 0", border: 0 }}>
                  <div className="v" style={{ fontSize: "2.4rem" }}>{v || <Sk w="50%" />}</div>
                  <div className="l">{note}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── the key ── */}
      <section className="sec dark" id="key">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">// A KEY THAT EXPIRES · SessionKeyExecutor.sessions(agent)</span>
              <h2>Whose key does the agent hold?</h2>
            </div>
            <p>
              The agent&rsquo;s on-chain key is a session: boxed by expiry, per-trade and cumulative budget,
              trade count and a ticker allowlist. Revocable any time by the owner. A refused order reverts
              the whole transaction, so it spends none of this.
            </p>
          </div>
          <Reveal className="stats stats--4">
            <div className="stat">
              <div className="v" style={{ fontSize: "1.6rem" }}>{data ? <Countdown to={data.session.expiry} /> : <Sk />}</div>
              <div className="l">Expires · {data ? new Date(data.session.expiry * 1000).toUTCString().slice(5, 16) : "…"}</div>
            </div>
            <div className="stat">
              <div className="v">{data ? <>{data.session.tradesUsed}<span style={{ opacity: 0.4 }}>/{data.session.maxTrades}</span></> : <Sk w="40%" />}</div>
              <div className="l">Trades used / allowed</div>
            </div>
            <div className="stat">
              <div className="v">{data ? <>${fmtUsdg(data.session.cumNotionalUsed, 0)}<span style={{ opacity: 0.4, fontSize: "0.5em" }}> / ${fmtUsdg(data.session.maxCumNotional, 0)}</span></> : <Sk />}</div>
              <div className="l">Budget spent / total (USDG) · ${data ? fmtUsdg(data.session.maxNotionalPerTrade, 0) : "…"} per trade</div>
            </div>
            <div className="stat">
              <div className="v" style={{ fontSize: "1.6rem" }}>
                {data ? <>
                  <span className={`tg ${data.session.buysAllowed ? "lime" : "red"}`}>BUY {data.session.buysAllowed ? "ON" : "OFF"}</span>{" · "}
                  <span className={`tg ${data.session.sellsAllowed ? "lime" : "red"}`}>SELL {data.session.sellsAllowed ? "ON" : "OFF"}</span>
                </> : <Sk />}
              </div>
              <div className="l">{data ? (data.session.live ? "Session live" : data.session.active ? "Session exhausted / expired" : "No session") : "…"} · agent {data ? <a href={addrUrl(data.addr.agent)} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{short(data.addr.agent)}</a> : "…"}</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── the riddle: previewTrade() ── */}
      <section className="sec" id="riddle">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">// THE RIDDLE · RWAVault.previewTrade() · READ-ONLY</span>
              <h2>Ask the Sphinx yourself.</h2>
            </div>
            <p>
              Compose a swap and the vault tells you the exact rule it would break — before anyone
              signs. This is a <b>view</b> call on mainnet: nothing is placed, nothing is spent. Want to
              actually sign one? That is the <a href="/trade" style={{ textDecoration: "underline" }}>Trade terminal</a>.
            </p>
          </div>
          <div className="risklab">
            <div>
              <div className="ctrl">
                <label>Stock token</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {STOCK_TOKENS.map((t) => (
                    <button key={t.ticker} className="btn-mini" aria-pressed={token === t.ticker} onClick={() => { setToken(t.ticker); setVerdict(null); }} style={{ opacity: token === t.ticker ? 1 : 0.5, flex: 1 }}>
                      {t.ticker}{data ? ` · $${fmtE18(data.markets.find((m) => m.ticker === t.ticker)?.twapE18 ?? "0", 0)}` : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ctrl">
                <label>Side</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-mini" aria-pressed={side === "buy"} onClick={() => { setSide("buy"); setVerdict(null); }} style={{ opacity: side === "buy" ? 1 : 0.5, flex: 1 }}>BUY (USDG → stock)</button>
                  <button className="btn-mini" aria-pressed={side === "sell"} onClick={() => { setSide("sell"); setVerdict(null); }} style={{ opacity: side === "sell" ? 1 : 0.5, flex: 1 }}>SELL (stock → USDG)</button>
                </div>
              </div>
              <div className="ctrl">
                <label htmlFor="rf-amt">{side === "buy" ? "USDG to spend" : `${token} to sell`}</label>
                <input id="rf-amt" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, "")); setVerdict(null); }}
                  style={{ width: "100%", background: "rgba(0,0,0,.28)", border: "1px solid var(--hair-hi)", borderRadius: 10, color: "var(--ink)", fontFamily: "var(--ff-display)", fontSize: "1.6rem", padding: "10px 14px", outline: "none" }} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  {(side === "buy" ? ["50", "150", "1500", "5000"] : ["0.1", "0.5", "1", "5"]).map((v) => (
                    <button key={v} className="btn-mini" onClick={() => { setAmount(v); setVerdict(null); }} style={{ flex: 1, opacity: amount === v ? 1 : 0.6 }}>{v}</button>
                  ))}
                </div>
              </div>
              {side === "buy" && (
                <div className="ctrl">
                  <label htmlFor="rf-stop">Stop below entry · {stopPct.toFixed(1)}% {data ? `· cap ${bps(data.caps.stopLossBps)}` : ""} {twap ? `· $${(Number(BigInt(twap)) / 1e18 * (1 - stopPct / 100)).toFixed(2)}` : ""}</label>
                  <input id="rf-stop" type="range" min={0} max={12} step={0.5} value={stopPct} onChange={(e) => { setStopPct(Number(e.target.value)); setVerdict(null); }} />
                  <div className="eyebrow" style={{ marginTop: 4 }}>0% = no stop · above {data ? bps(data.caps.stopLossBps) : "8%"} = too deep · both refuse</div>
                </div>
              )}
              <button className="btn-mini" onClick={ask} disabled={asking || !Number(amount)} style={{ marginTop: 8 }}>
                {asking ? "ASKING…" : "ASK THE SPHINX ▸"}
              </button>
            </div>
            <div className="term" style={{ position: "relative", minHeight: 260, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <PixelSphynx size={44} color={verdict ? (verdict.violation === "None" ? "#E8B85A" : "#E2664A") : "#E8B85A"} />
                <span className="eyebrow">previewTrade() → Guardrails.Violation</span>
              </div>
              {!verdict ? (
                <>
                  <div className="term-line"><span className="tg cmd">$</span> compose a swap, then ask. <span className="caret" /></div>
                  <div className="term-line" style={{ opacity: 0.5, marginTop: 8 }}>try: 5,000 USDG → PerTradeCap · stop 0% → MissingStop · stop 12% → MissingStop · sell 1 NVDA → InsufficientPosition</div>
                </>
              ) : (
                <>
                  <div className="term-line"><span className="tg cmd">$</span> previewTrade({token}, {side}, {Number(amount).toLocaleString("en-US")}{side === "buy" ? " USDG" : ` ${token}`}{side === "buy" ? `, stop=${stopPct}%` : ""})</div>
                  <div className={`term-line ${verdict.violation === "None" ? "you" : ""}`}>
                    <span className={`tg ${verdict.violation === "None" ? "lime" : "red"}`}>{verdict.violation === "None" ? "PASS" : "REFUSED"}</span>{" · "}{verdict.violation}
                  </div>
                  <div className="term-line"><span className="tg cmd">{VIOLATION_TEXT[verdict.violation]}</span></div>
                  {BigInt(verdict.quote) > 0n && (
                    <div className="term-line" style={{ marginTop: 6 }}>
                      <span className="tg cmd">quote</span> {side === "buy" ? `${fmtUnits(verdict.quote)} ${token}` : `$${fmtUsdg(verdict.quote)}`} from the pool · min after 1% slippage {side === "buy" ? fmtUnits(verdict.minAmountOut) : `$${fmtUsdg(verdict.minAmountOut)}`}
                    </div>
                  )}
                  <div className="term-line"><span className="tg warn">a refused swap spends none of the session budget · nothing was placed</span></div>
                  {verdict.violation === "None" && (
                    <div className="term-line" style={{ marginTop: 8 }}><a href="/trade" className="tg lime" style={{ textDecoration: "underline" }}>sign it at /trade ↗</a></div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── the record ── */}
      <section className="sec dark" id="record">
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">// THE RECORD · RWAVault events · read from the chain</span>
              <h2>Every fill, forever.</h2>
            </div>
            <p>
              What the vault has actually executed, straight from its <code>TradeExecuted</code> events.
              Empty means empty. When there are fills, they appear here before we could write a word about them.
            </p>
          </div>
          <div className="term" style={{ padding: 20, minHeight: 0 }}>
            {!history ? (
              <div className="term-line"><span className="tg cmd">$</span> reading events… <span className="caret" /></div>
            ) : history.trades.length === 0 ? (
              <>
                <div className="term-line"><span className="tg cmd">$</span> eth_getLogs(vault, TradeExecuted) → 0 results</div>
                <div className="term-line" style={{ opacity: 0.6 }}>no order has been filled yet. NAV is ${data ? fmtUsdg(data.vault.totalAssets) : "…"}. The first fill goes on this record and cannot be removed.</div>
              </>
            ) : history.trades.slice(0, 12).map((t) => (
              <div key={t.tx} className="term-line">
                <span className={`tg ${t.isBuy ? "lime" : "red"}`}>{t.isBuy ? "BUY " : "SELL"}</span>
                {t.ticker} · {t.isBuy ? `$${fmtUsdg(t.amountIn)} → ${fmtUnits(t.amountOut)} ${t.ticker}` : `${fmtUnits(t.amountIn)} ${t.ticker} → $${fmtUsdg(t.amountOut)}`} · @ ${fmtE18(t.priceE18)} · NAV after ${fmtUsdg(t.navAfter)} ·{" "}
                <a href={txUrl(t.tx)} target="_blank" rel="noreferrer" className="tg cmd" style={{ textDecoration: "underline" }}>{t.tx.slice(0, 10)}…</a>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
            {data && ([
              ["RWAVault", data.addr.vault], ["SessionKeyExecutor", data.addr.executor], ["GuardrailConfig", data.addr.guardrailConfig],
              ["UniswapV3Oracle", data.addr.oracle], ["UniswapV3Adapter", data.addr.adapter], ["DeskRegistry", data.addr.deskRegistry],
            ] as [string, string][]).map(([n, a]) => (
              <a key={n} href={addrUrl(a)} target="_blank" rel="noreferrer" className="btn-mini" style={{ textDecoration: "none" }}>{n} · {short(a)} ↗</a>
            ))}
            <a href="/docs/contracts" className="btn-mini" style={{ textDecoration: "none" }}>Contracts reference →</a>
          </div>
        </div>
      </section>
    </>
  );
}
