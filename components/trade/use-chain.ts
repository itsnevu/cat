"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Attestation, Caps, Market, Position, Session, VaultState, Trade, Flow } from "@/lib/chain";

export type ChainData = {
  ok: true; at: number; stale?: boolean; staleFor?: number; caps: Caps; session: Session; vault: VaultState; markets: Market[]; positions: Position[];
  registry: { count: number; latest: Attestation[] }; addr: Record<string, string>; block: number;
};
export type HistoryData = { ok: true; at: number; trades: Trade[]; flows: Flow[] };
export type Holder = { shares: string; value: string; maxWithdraw: string; usdg: string; session: Session };

export function useChain(intervalMs = 30_000) {
  const [data, setData] = useState<ChainData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/chain", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) { setData(j); setErr(j.stale ? `stale · ${Math.round((j.staleFor ?? 0) / 1000)}s` : null); }
      else setErr(j.error ?? "chain unreachable"); // keep the last data on screen
    } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, intervalMs); return () => clearInterval(id); }, [load, intervalMs]);
  return { data, err, loading, refresh: load };
}

export function useHistory(intervalMs = 60_000) {
  const [data, setData] = useState<HistoryData | null>(null);
  const load = useCallback(async () => {
    try { const j = await (await fetch("/api/chain?trades=1", { cache: "no-store" })).json(); if (j.ok) setData(j); } catch { /* keep last */ }
  }, []);
  useEffect(() => { load(); const id = setInterval(load, intervalMs); return () => clearInterval(id); }, [load, intervalMs]);
  return { history: data, refresh: load };
}

export function useHolder(account: string | null) {
  const [holder, setHolder] = useState<Holder | null>(null);
  const load = useCallback(async () => {
    if (!account) { setHolder(null); return; }
    try { const j = await (await fetch(`/api/chain?holder=${account}`, { cache: "no-store" })).json(); if (j.ok) setHolder(j.holder); } catch { /* keep last */ }
  }, [account]);
  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [load]);
  return { holder, refresh: load };
}

export type Toast = { id: number; kind: "ok" | "err" | "info"; title: string; body?: string; href?: string };
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++n.current;
    setToasts((x) => [...x, { ...t, id }]);
    if (t.kind !== "err") setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 9000);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((x) => x.filter((y) => y.id !== id)), []);
  return { toasts, push, dismiss };
}
