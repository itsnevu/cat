import Link from "next/link";
import { PixelSphynx } from "@/components/ui/pixel-sphynx";

export const metadata = { title: "Not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="sec dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", padding: "120px 24px" }}>
      <div className="wrap" style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <PixelSphynx size={96} color="#E2664A" />
        </div>
        <span className="eyebrow">// previewTrade() → NotAllowed · HTTP 404</span>
        <h1 style={{ fontFamily: "var(--ff-display)", fontWeight: 500, fontSize: "clamp(2.6rem, 7vw, 4.6rem)", lineHeight: 1, margin: "16px 0 18px", color: "var(--ink)" }}>
          The Sphinx has no answer here.
        </h1>
        <p style={{ color: "var(--ink-2)", fontSize: 16, lineHeight: 1.7, margin: "0 auto 32px", maxWidth: 480 }}>
          This path is not on the allowlist. Nothing was placed, nothing was spent.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/" className="btn btn-lime">Home</Link>
          <Link href="/trade" className="btn btn-ghost">Trade</Link>
          <Link href="/docs" className="btn btn-ghost">Docs</Link>
          <Link href="/refusals" className="btn btn-ghost">Refusals</Link>
        </div>
      </div>
    </main>
  );
}
