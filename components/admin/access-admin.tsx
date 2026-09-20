"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "@/components/trade/trade.css";
import { useWallet, short, txUrl, addrUrl } from "@/lib/wallet";
import { ADDR, STOCK_TOKENS, addrWord, word, fmtUsdg } from "@/lib/chain";
import { useToasts } from "@/components/trade/use-chain";

type Req = {
  id: string; lane: string; wallet: string; email: string; persona: string; telegram?: string; intent?: string; createdAt: string;
};
type Sess = { live: boolean; active: boolean; expiry: number; maxNotionalPerTrade: string; maxTrades: number; tradesUsed: number; maxCumNotional: string; cumNotionalUsed: string };

const LANE: Record<string, string> = { "wallet-preorder": "Pre-order", "desk-access": "Desk", "vault-access": "Vault" };
const SEL_GRANT = "0xcbb1ddef";
const SEL_REVOKE = "0x74a8f103";

function grantCalldata(agent: string, days: number, perTradeUsdg: number, maxTrades: number, budgetUsdg: number, buys: boolean, sells: boolean, tokens: string[]) {
  const expiry = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
  // abi: (address,uint64,uint256,uint32,uint256,bool,bool,address[]) — the array is dynamic, offset = 8 words
  const head = addrWord(agent) + word(expiry) + word(BigInt(Math.round(perTradeUsdg * 1e6))) + word(BigInt(maxTrades))
    + word(BigInt(Math.round(budgetUsdg * 1e6))) + word(buys ? 1n : 0n) + word(sells ? 1n : 0n) + word(8n * 32n);
  const tail = word(BigInt(tokens.length)) + tokens.map(addrWord).join("");
  return SEL_GRANT + head + tail;
}

function approvalEmail(r: Req) {
  return `Subject: SPHYNX access is open

Hi,

Your request (${r.id}) is approved. Access is open now.

1. Open https://sphynxagent.xyz/trade and connect the wallet you registered (${r.wallet}).
2. Switch to Robinhood Chain when prompted (chain 4663; you need a little ETH there for gas).
3. Deposit USDG. You receive vSPHYNX shares at the current share price and can withdraw or redeem in kind at any time.

Please read before you deposit: https://sphynxagent.xyz/docs/risks
The vault is unaudited, deposits are capped at 10,000 USDG, there is no track record, Stock Tokens are not shares and are not for US persons. Not investment advice.

Questions: reply to this email.

SPHYNX`;
}

export function AccessAdmin() {
  const w = useWallet();
  const { toasts, push, dismiss } = useToasts();
  const [token, setToken] = useState("");
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Record<string, Sess>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [cfg, setCfg] = useState({ days: 7, perTrade: 200, maxTrades: 10, budget: 1000, buys: true, sells: true });
  const [approved, setApproved] = useState<Record<string, true>>({});

  useEffect(() => {
    try {
      const h = window.location.hash.slice(1);
      const saved = h || localStorage.getItem("sphynx-admin-token") || "";
      if (saved) setToken(saved);
      const a = JSON.parse(localStorage.getItem("sphynx-admin-approved") || "{}");
      setApproved(a);
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async (t: string) => {
    if (!t) return;
    try {
      const r = await fetch("/api/access-request", { headers: { authorization: `Bearer ${t}` }, cache: "no-store" });
      const j = await r.json();
      if (!j.ok) { setErr(j.error); setReqs(null); return; }
      setErr(null); setReqs(j.requests);
      try { localStorage.setItem("sphynx-admin-token", t); } catch { /* ignore */ }
    } catch (e) { setErr(String(e)); }
  }, []);
  useEffect(() => { load(token); }, [token, load]);

  // one row per wallet, newest first, with a count of submissions
  const rows = useMemo(() => {
    if (!reqs) return [];
    const m = new Map<string, Req & { n: number; lanes: Set<string> }>();
    for (const r of reqs) {
      const k = (r.wallet || "").toLowerCase() || r.email;
      const e = m.get(k);
      if (e) { e.n++; e.lanes.add(r.lane); } else m.set(k, { ...r, n: 1, lanes: new Set([r.lane]) });
    }
    return [...m.values()];
  }, [reqs]);

  // session state for each wallet
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const r of rows) {
        if (!/^0x[0-9a-fA-F]{40}$/.test(r.wallet)) continue;
        try {
          const j = await (await fetch(`/api/chain?holder=${r.wallet}`, { cache: "no-store" })).json();
          if (alive && j.ok) setSessions((s) => ({ ...s, [r.wallet.toLowerCase()]: j.holder.session }));
        } catch { /* skip */ }
      }
    })();
    return () => { alive = false; };
  }, [rows]);

  const markApproved = (id: string) => {
    const a = { ...approved, [id]: true as const };
    setApproved(a);
    try { localStorage.setItem("sphynx-admin-approved", JSON.stringify(a)); } catch { /* ignore */ }
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); push({ kind: "ok", title: `${label} copied` }); }
    catch { push({ kind: "err", title: "Clipboard blocked", body: "Select and copy manually." }); }
  };

  const isOwner = !!w.account && w.account.toLowerCase() === ADDR.safe.toLowerCase();

  const grant = async (r: Req) => {
    setBusy(r.id);
    try {
      if (!w.account) { await w.connect(); return; }
      if (!w.onChain) { await w.switchChain(); return; }
      const data = grantCalldata(r.wallet, cfg.days, cfg.perTrade, cfg.maxTrades, cfg.budget, cfg.buys, cfg.sells, STOCK_TOKENS.map((t) => t.address));
      const hash = await w.send(ADDR.executor, data);
      push({ kind: "info", title: "grant() sent", href: txUrl(hash) });
      const res = await w.wait(hash);
      push({ kind: res.status ? "ok" : "err", title: res.status ? `Session granted to ${short(r.wallet)}` : "grant() reverted", href: txUrl(hash) });
      if (res.status) {
        markApproved(r.id);
        const j = await (await fetch(`/api/chain?holder=${r.wallet}`, { cache: "no-store" })).json();
        if (j.ok) setSessions((s) => ({ ...s, [r.wallet.toLowerCase()]: j.holder.session }));
      }
    } catch (e) { push({ kind: "err", title: "grant failed", body: (e as Error).message.slice(0, 200) }); }
    finally { setBusy(null); }
  };

  const revoke = async (r: Req) => {
    setBusy(r.id);
    try {
      if (!w.onChain) { await w.switchChain(); return; }
      const hash = await w.send(ADDR.executor, SEL_REVOKE + addrWord(r.wallet));
      const res = await w.wait(hash);
      push({ kind: res.status ? "ok" : "err", title: res.status ? "Session revoked" : "revoke() reverted", href: txUrl(hash) });
      const j = await (await fetch(`/api/chain?holder=${r.wallet}`, { cache: "no-store" })).json();
      if (j.ok) setSessions((s) => ({ ...s, [r.wallet.toLowerCase()]: j.holder.session }));
    } catch (e) { push({ kind: "err", title: "revoke failed", body: (e as Error).message.slice(0, 200) }); }
    finally { setBusy(null); }
  };

  return (
    <section className="tt" style={{ paddingTop: 60 }}>
      <div className="wrap">
        <div className="tt-top">
          <div>
            <span className="eyebrow">// ADMIN · ACCESS REQUESTS · NOT LINKED FROM THE SITE</span>
            <h1>Who is at the <em>gate</em>.</h1>
            <p>Every request the form saved. Approve someone by sending them the email (they can deposit right away, no transaction needed). Grant a session only if you want that wallet to place orders for the vault.</p>
          </div>
          <div className="tt-wallet">
            {w.account ? (
              <span className={`tt-pill ${isOwner ? "ok" : "bad"}`}><span className="dot" />{isOwner ? "owner wallet" : "not the owner"} · {short(w.account)}</span>
            ) : (
              <button className="tt-btn" onClick={w.connect}>Connect owner wallet</button>
            )}
          </div>
        </div>

        {!reqs && (
          <div className="tt-card" style={{ maxWidth: 520 }}>
            <div className="tt-card-h">Admin token</div>
            <div className="tt-card-b">
              <div className="tt-field" style={{ marginTop: 0 }}>
                <label><span>ACCESS_ADMIN_TOKEN from the server</span></label>
                <div className="tt-input"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste token" style={{ fontSize: "1rem", fontFamily: "var(--ff-mono)" }} /></div>
              </div>
              {err && <div className="tt-warn" style={{ marginTop: 12 }}><b>Error:</b> {err}</div>}
              <div className="tt-note">Or open this page as <code>/admin/access#&lt;token&gt;</code>. The token is kept in this browser only.</div>
            </div>
          </div>
        )}

        {reqs && (
          <>
            <div className="tt-card" style={{ marginBottom: 18 }}>
              <div className="tt-card-h">Session to grant<span className="grow">applies to the Grant button below · caps still bind every order</span></div>
              <div className="tt-card-b">
                <div className="tt-caps">
                  {([["days", "Days", 1], ["perTrade", "USDG / trade", 10], ["maxTrades", "Max trades", 1], ["budget", "Budget USDG", 10]] as [keyof typeof cfg, string, number][]).map(([k, l, step]) => (
                    <div className="tt-cap" key={k}>
                      <div className="l">{l}</div>
                      <div className="tt-input" style={{ marginTop: 6 }}><input inputMode="decimal" value={String(cfg[k])} step={step} onChange={(e) => setCfg((c) => ({ ...c, [k]: Number(e.target.value) || 0 }))} style={{ fontSize: "1.2rem", padding: "6px 0" }} /></div>
                    </div>
                  ))}
                  <div className="tt-cap"><div className="l">Sides</div><div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button className={`tt-btn sm ${cfg.buys ? "lime" : ""}`} onClick={() => setCfg((c) => ({ ...c, buys: !c.buys }))}>BUY</button>
                    <button className={`tt-btn sm ${cfg.sells ? "red" : ""}`} onClick={() => setCfg((c) => ({ ...c, sells: !c.sells }))}>SELL</button>
                  </div></div>
                  <div className="tt-cap"><div className="l">Tokens</div><div className="v" style={{ fontSize: "1rem", marginTop: 10 }}>{STOCK_TOKENS.map((t) => t.ticker).join(" · ")}</div></div>
                </div>
              </div>
            </div>

            <div className="tt-card">
              <div className="tt-card-h">Requests<span className="grow">{rows.length} wallets · {reqs.length} submissions</span></div>
              {rows.length === 0 ? <div className="tt-empty">No requests yet.</div> : (
                <table className="tt-table">
                  <thead><tr><th>When</th><th>Wallet</th><th>Contact</th><th>Lane</th><th>Note</th><th>Session</th><th className="r">Actions</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const s = sessions[r.wallet.toLowerCase()];
                      const ok = approved[r.id];
                      return (
                        <tr key={r.id}>
                          <td style={{ whiteSpace: "nowrap" }}>{r.createdAt.slice(0, 16).replace("T", " ")}<br /><span style={{ color: "var(--ink-soft)", fontSize: 11 }}>{r.id}{r.n > 1 ? ` · ×${r.n}` : ""}</span></td>
                          <td><a href={addrUrl(r.wallet)} target="_blank" rel="noreferrer">{short(r.wallet)}</a></td>
                          <td style={{ fontSize: 12 }}>{r.email}<br /><span style={{ color: "var(--ink-2)" }}>{r.telegram || "—"} · {r.persona}</span></td>
                          <td>{[...r.lanes].map((l) => <span key={l} className="tt-side buy" style={{ marginRight: 4 }}>{LANE[l] ?? l}</span>)}</td>
                          <td style={{ maxWidth: 260, fontSize: 12, color: "var(--ink-2)" }}>{r.intent?.slice(0, 140) || "—"}</td>
                          <td style={{ fontSize: 12 }}>
                            {s ? (s.live ? <span className="up">LIVE · {s.tradesUsed}/{s.maxTrades} · ${fmtUsdg(s.cumNotionalUsed, 0)}/${fmtUsdg(s.maxCumNotional, 0)}</span> : s.active ? <span className="dn">exhausted / expired</span> : <span style={{ color: "var(--ink-soft)" }}>none</span>) : "…"}
                          </td>
                          <td className="r" style={{ whiteSpace: "nowrap" }}>
                            <button className={`tt-btn sm ${ok ? "" : "lime"}`} onClick={() => { copy(approvalEmail(r), "Approval email"); markApproved(r.id); }}>{ok ? "Email again" : "Approve + copy email"}</button>{" "}
                            {s?.live
                              ? <button className="tt-btn sm" disabled={busy === r.id || !isOwner} onClick={() => revoke(r)}>Revoke</button>
                              : <button className="tt-btn sm" disabled={busy === r.id || !isOwner} title={isOwner ? "" : "connect the owner wallet"} onClick={() => grant(r)}>{busy === r.id ? "…" : "Grant session"}</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            <div className="tt-note">
              <b>Approve</b> = they can deposit (already possible for anyone; the email just tells them). <b>Grant session</b> = that wallet can place orders for the vault inside the caps above; it is a transaction from the owner wallet <a href={addrUrl(ADDR.safe)} target="_blank" rel="noreferrer">{short(ADDR.safe)}</a>. Approved marks live in this browser only.
            </div>
          </>
        )}
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
