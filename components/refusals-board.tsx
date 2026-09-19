"use client";

import { useEffect, useMemo, useState } from "react";
import { PixelSphynx } from "@/components/ui/pixel-sphynx";
import { Reveal } from "@/components/ui/reveal";
import { bps, fmtUsdg, STOCK_TOKENS, VIOLATION_TEXT, type Caps, type Session, type Violation, type Attestation, type VaultState } from "@/lib/chain";

type ChainData = {
  ok: true; at: number; caps: Caps; session: Session; vault: VaultState;
  registry: { count: number; latest: Attestation[] };
  addr: Record<string, string>;
};

const EXPLORER = "https://explorer.mainnet.chain.robinhood.com/address/";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function useChain() {
  const [data, setData] = useState<ChainData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/chain")
        .then((r) => r.json())
        .then((j) => { if (!alive) return; if (j.ok) { setData(j); setErr(null); } else setErr(j.error ?? "chain unreachable"); })
        .catch((e) => alive && setErr(String(e)));
    load();
    const id = setInterval(load, 45_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return { data, err };
}

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => { const id = setInterval(() => setNow(Date.now() / 1000), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, to - now);
  if (left === 0) return <span className="tg red">EXPIRED</span>;
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = Math.floor(left % 60);
  return <span className="tg lime" style={{ fontVariantNumeric: "tabular-nums" }}>{d}d {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}</span>;
}

export function RefusalsBoard() {
  const { data, err } = useChain();
  const [token, setToken] = useState("NVDA");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState(1500);
  const [stop, setStop] = useState(true);
  const [verdict, setVerdict] = useState<{ v: Violation; at: number } | null>(null);
  const [asking, setAsking] = useState(false);
  const [refusedHere, setRefusedHere] = useState(0);

  const ask = async () => {
    setAsking(true);
    try {
      const r = await fetch(`/api/chain?preview=1&token=${token}&side=${side}&amount=${amount}&stop=${stop ? 1 : 0}`);
      const j = await r.json();
      if (j.ok) { setVerdict({ v: j.violation, at: Date.now() }); if (j.violation !== "None") setRefusedHere((n) => n + 1); }
      else setVerdict({ v: "Paused", at: Date.now() });
    } finally { setAsking(false); }
  };

  const capRows = useMemo(() => data ? [
    ["Per-trade cap", bps(data.caps.perTradeBps), "of NAV per order"],
    ["Max concentration", bps(data.caps.maxConcentrationBps), "in one symbol"],
    ["Max open positions", String(data.caps.maxOpenPositions), "distinct names"],
    ["Max daily orders", String(data.caps.maxDailyOrders), "buys + sells"],
    ["Required stop", bps(data.caps.stopLossBps), "below entry, every buy"],
    ["Daily loss halt", bps(data.caps.dailyLossHaltBps), "day P&L — buys freeze"],
    ["Cash buffer", bps(data.caps.cashBufferBps), "of NAV kept in cash"],
  ] : [], [data]);

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
          <Reveal className="stats">
            <div className="stat">
              <div className="v">{data ? data.registry.count : err ? "—" : "…"}</div>
              <div className="l">Attestations on the append-only record</div>
            </div>
            <div className="stat">
              <div className="v">{data ? `$${fmtUsdg(data.vault.totalAssets)}` : "…"}</div>
              <div className="l">Vault NAV (USDG) · cap ${data ? fmtUsdg(data.vault.depositCap) : "…"}</div>
            </div>
            <div className="stat">
              <div className="v">{refusedHere}</div>
              <div className="l">Refusals you triggered below (preview only)</div>
            </div>
          </Reveal>
          <p className="eyebrow" style={{ marginTop: 18 }}>
            {err ? `CHAIN UNREACHABLE · ${err}` : data ? `READ ${new Date(data.at).toLocaleTimeString()} · REFRESHES EVERY 45S` : "READING…"}
            {" · "}TVL 0 · NO DEPOSITORS · NOTHING ATTESTED YET · UNAUDITED
          </p>
          {data && data.registry.latest.length > 0 && (
            <div className="term" style={{ marginTop: 28, padding: 20, minHeight: 0 }}>
              {data.registry.latest.map((a) => (
                <div key={a.epoch} className="term-line">
                  <span className="tg lime">EPOCH {a.epoch}</span> <span className="tg cmd">{new Date(a.timestamp * 1000).toISOString()}</span>{" "}
                  nav {a.nav} · pnl {a.realizedPnl} · {a.snapshotHash.slice(0, 18)}…
                </div>
              ))}
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
              {data ? <a href={EXPLORER + data.addr.guardrailConfig} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>{short(data.addr.guardrailConfig)}</a> : "the contract"},
              not from our copy. Changing one takes 2-of-3 Safe signatures; there is no timelock yet.
            </p>
          </div>
          <div className="guards">
            {capRows.map(([k, v, note], i) => (
              <Reveal key={k} delay={i * 40} className="guard">
                <h3><span className="b" /> {k}</h3>
                <div className="stat" style={{ padding: "10px 0 0", border: 0 }}>
                  <div className="v" style={{ fontSize: "2.4rem" }}>{v}</div>
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
              trade count and a ticker allowlist. Revocable any time by the Safe. Today it is a zero-limit
              placeholder — the mechanism is live, the allowance is nil.
            </p>
          </div>
          {data && (
            <Reveal className="stats stats--4">
              <div className="stat">
                <div className="v" style={{ fontSize: "1.6rem" }}><Countdown to={data.session.expiry} /></div>
                <div className="l">Expires · {new Date(data.session.expiry * 1000).toUTCString().slice(5, 16)}</div>
              </div>
              <div className="stat">
                <div className="v">{data.session.tradesUsed}<span style={{ opacity: 0.4 }}>/{data.session.maxTrades}</span></div>
                <div className="l">Trades used / allowed</div>
              </div>
              <div className="stat">
                <div className="v">${fmtUsdg(data.session.cumNotionalUsed)}<span style={{ opacity: 0.4, fontSize: "0.5em" }}> / ${fmtUsdg(data.session.maxCumNotional)}</span></div>
                <div className="l">Budget spent / total (USDG)</div>
              </div>
              <div className="stat">
                <div className="v" style={{ fontSize: "1.6rem" }}>
                  <span className={`tg ${data.session.buysAllowed ? "lime" : "red"}`}>BUY {data.session.buysAllowed ? "ON" : "OFF"}</span>{" · "}
                  <span className={`tg ${data.session.sellsAllowed ? "lime" : "red"}`}>SELL {data.session.sellsAllowed ? "ON" : "OFF"}</span>
                </div>
                <div className="l">{data.session.active ? "Session active" : "No session"} · agent {short(data.addr.agent)}</div>
              </div>
            </Reveal>
          )}
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
              signs. This is a <b>view</b> call on mainnet: nothing is placed, nothing is spent. With
              NAV at zero the honest answer today is <i>Unfunded</i>.
            </p>
          </div>
          <div className="risklab">
            <div>
              <div className="ctrl">
                <label htmlFor="rf-token">Stock token</label>
                <select id="rf-token" value={token} onChange={(e) => setToken(e.target.value)} className="btn-mini" style={{ width: "100%", textAlign: "left" }}>
                  {STOCK_TOKENS.map((t) => <option key={t.ticker} value={t.ticker}>{t.ticker} · {short(t.address)}</option>)}
                </select>
              </div>
              <div className="ctrl">
                <label>Side</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn-mini" aria-pressed={side === "buy"} onClick={() => setSide("buy")} style={{ opacity: side === "buy" ? 1 : 0.5 }}>BUY (USDG → stock)</button>
                  <button className="btn-mini" aria-pressed={side === "sell"} onClick={() => setSide("sell")} style={{ opacity: side === "sell" ? 1 : 0.5 }}>SELL</button>
                </div>
              </div>
              <div className="ctrl">
                <label htmlFor="rf-amt">{side === "buy" ? "USDG to spend" : "Tokens to sell"} · {amount.toLocaleString()}</label>
                <input id="rf-amt" type="range" min={0} max={20000} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </div>
              <div className="ctrl">
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" checked={stop} onChange={(e) => setStop(e.target.checked)} /> Carry a stop below market
                </label>
              </div>
              <button className="btn-mini" onClick={ask} disabled={asking} style={{ marginTop: 8 }}>
                {asking ? "ASKING…" : "ASK THE SPHINX ▸"}
              </button>
            </div>
            <div className="term" style={{ position: "relative", minHeight: 220, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <PixelSphynx size={44} color={verdict ? (verdict.v === "None" ? "#E8B85A" : "#E2664A") : "#E8B85A"} />
                <span className="eyebrow">previewTrade() → Guardrails.Violation</span>
              </div>
              {!verdict ? (
                <div className="term-line"><span className="tg cmd">$</span> compose a swap, then ask. <span className="caret" /></div>
              ) : (
                <>
                  <div className="term-line"><span className="tg cmd">$</span> previewTrade({token}, {side}, {amount}{side === "buy" ? " USDG" : ""}, stop={stop ? "yes" : "no"})</div>
                  <div className={`term-line ${verdict.v === "None" ? "you" : ""}`}>
                    <span className={`tg ${verdict.v === "None" ? "lime" : "red"}`}>{verdict.v === "None" ? "PASS" : "REFUSED"}</span>{" · "}{verdict.v}
                  </div>
                  <div className="term-line"><span className="tg cmd">{VIOLATION_TEXT[verdict.v]}</span></div>
                  <div className="term-line"><span className="tg warn">a refused swap spends none of the session budget · nothing was placed</span></div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
