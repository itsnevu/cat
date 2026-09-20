"use client";

import { useEffect } from "react";
import { PixelSphynx } from "@/components/ui/pixel-sphynx";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="sec dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: "120px 24px" }}>
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <PixelSphynx size={96} color="#F5A742" />
        </div>
        <span className="eyebrow">// something reverted · not on chain, just this page</span>
        <h1 style={{ fontFamily: "var(--ff-display)", fontWeight: 500, fontSize: "clamp(2.4rem, 6vw, 4rem)", lineHeight: 1, margin: "16px 0 18px", color: "var(--ink)" }}>
          The page tripped a guardrail.
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: 16, lineHeight: 1.7, margin: "0 auto 12px", maxWidth: 480 }}>
          A render error, not a chain error. Your wallet, the vault and the record are unaffected.
        </p>
        {error.digest && <p className="eyebrow" style={{ marginBottom: 28 }}>digest {error.digest}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
          <button className="btn btn-lime" onClick={reset}>Try again</button>
          <a href="/" className="btn btn-ghost">Home</a>
        </div>
      </div>
    </main>
  );
}
