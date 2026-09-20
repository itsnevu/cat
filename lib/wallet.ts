"use client";
/**
 * Injected-wallet plumbing without a library: EIP-1193 provider, chain switch to Robinhood Chain,
 * raw calldata encoding for the handful of writes the trade UI needs. Signing happens in the wallet.
 */
import { useCallback, useEffect, useState } from "react";
import { ADDR, CHAIN_ID, addrWord, word, RPC_URL, EXPLORER } from "@/lib/chain";

type Eip1193 = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (ev: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (ev: string, cb: (...a: unknown[]) => void) => void;
  isMetaMask?: boolean;
};
declare global { interface Window { ethereum?: Eip1193 } }

export const CHAIN_HEX = "0x" + CHAIN_ID.toString(16);
export const CHAIN_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: [RPC_URL.startsWith("http://127") ? "https://rpc.mainnet.chain.robinhood.com" : RPC_URL],
  blockExplorerUrls: [EXPLORER],
};

// keccak-free selector table: precomputed with `cast sig`
const SELECTORS: Record<string, string> = {
  "approve(address,uint256)": "0x095ea7b3",
  "deposit(uint256,address)": "0x6e553f65",
  "withdraw(uint256,address,address)": "0xb460af94",
  "redeemInKind(uint256,address)": "0x6aaf8653",
  "execute((address,bool,uint256,uint256,uint256,bool))": "0x65f82a8f",
};
export const sel = (sig: string) => SELECTORS[sig];

export type TradeTuple = { stockToken: string; isBuy: boolean; amountIn: string; minAmountOut: string; stopPriceE18: string; leftSideException: boolean };

export const calldata = {
  approve: (spender: string, amount: bigint) => sel("approve(address,uint256)") + addrWord(spender) + word(amount),
  deposit: (assets: bigint, receiver: string) => sel("deposit(uint256,address)") + word(assets) + addrWord(receiver),
  withdraw: (assets: bigint, receiver: string, owner: string) =>
    sel("withdraw(uint256,address,address)") + word(assets) + addrWord(receiver) + addrWord(owner),
  redeemInKind: (shares: bigint, receiver: string) => sel("redeemInKind(uint256,address)") + word(shares) + addrWord(receiver),
  execute: (t: TradeTuple) =>
    sel("execute((address,bool,uint256,uint256,uint256,bool))") + addrWord(t.stockToken) + word(t.isBuy ? 1n : 0n)
    + word(BigInt(t.amountIn)) + word(BigInt(t.minAmountOut)) + word(BigInt(t.stopPriceE18)) + word(t.leftSideException ? 1n : 0n),
};

export type WalletState = {
  provider: Eip1193 | null; account: string | null; chainId: number | null; connecting: boolean; error: string | null;
};

export function useWallet() {
  const [s, setS] = useState<WalletState>({ provider: null, account: null, chainId: null, connecting: false, error: null });

  useEffect(() => {
    const p = typeof window !== "undefined" ? window.ethereum ?? null : null;
    if (!p) return;
    setS((x) => ({ ...x, provider: p }));
    p.request({ method: "eth_accounts" }).then((a) => {
      const acc = (a as string[])[0] ?? null;
      setS((x) => ({ ...x, account: acc }));
    }).catch(() => {});
    p.request({ method: "eth_chainId" }).then((c) => setS((x) => ({ ...x, chainId: Number(c as string) }))).catch(() => {});
    const onAcc = (a: unknown) => setS((x) => ({ ...x, account: (a as string[])[0] ?? null }));
    const onChain = (c: unknown) => setS((x) => ({ ...x, chainId: Number(c as string) }));
    p.on?.("accountsChanged", onAcc);
    p.on?.("chainChanged", onChain);
    return () => { p.removeListener?.("accountsChanged", onAcc); p.removeListener?.("chainChanged", onChain); };
  }, []);

  const connect = useCallback(async () => {
    const p = window.ethereum;
    if (!p) { setS((x) => ({ ...x, error: "No wallet found. Install MetaMask or Rabby." })); return; }
    setS((x) => ({ ...x, connecting: true, error: null }));
    try {
      const a = (await p.request({ method: "eth_requestAccounts" })) as string[];
      const c = Number((await p.request({ method: "eth_chainId" })) as string);
      setS((x) => ({ ...x, provider: p, account: a[0] ?? null, chainId: c, connecting: false }));
    } catch (e) {
      setS((x) => ({ ...x, connecting: false, error: (e as Error).message }));
    }
  }, []);

  const switchChain = useCallback(async () => {
    const p = window.ethereum; if (!p) return;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
    } catch (e) {
      if ((e as { code?: number }).code === 4902) {
        await p.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
      } else throw e;
    }
  }, []);

  const send = useCallback(async (to: string, data: string, value = 0n): Promise<string> => {
    const p = window.ethereum; if (!p || !s.account) throw new Error("wallet not connected");
    const tx: Record<string, string> = { from: s.account, to, data };
    if (value > 0n) tx.value = "0x" + value.toString(16);
    return (await p.request({ method: "eth_sendTransaction", params: [tx] })) as string;
  }, [s.account]);

  /** Poll the receipt through the wallet's provider (same chain the user signed on). */
  const wait = useCallback(async (hash: string, timeoutMs = 90_000): Promise<{ status: boolean; hash: string }> => {
    const p = window.ethereum; if (!p) throw new Error("no provider");
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const r = (await p.request({ method: "eth_getTransactionReceipt", params: [hash] })) as { status?: string } | null;
      if (r) return { status: r.status === "0x1", hash };
      await new Promise((res) => setTimeout(res, 1500));
    }
    throw new Error("timed out waiting for receipt");
  }, []);

  return { ...s, onChain: s.chainId === CHAIN_ID, connect, switchChain, send, wait, vault: ADDR.vault, executor: ADDR.executor, usdg: ADDR.usdg };
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
