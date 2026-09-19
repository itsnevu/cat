import type { Metadata } from "next";
import Link from "next/link";
import { DocsTopbar } from "./_components/docs-topbar";
import { DocsSidebar } from "./_components/docs-sidebar";
import "./docs.css";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s // SPHYNX Docs" },
  description:
    "Documentation for Sphynx — the gatekeeper for 24/7 markets: on Robinhood you approve every order; on-chain every stock-token swap answers a vault that reverts any breach, behind a scoped, revocable, expiring key. Request access; on-chain module unaudited; not investment advice; not affiliated with Robinhood.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-root">
      <DocsTopbar />
      <div className="docs-shell wrap-docs">
        <DocsSidebar />
        {children}
      </div>
      <footer className="docs-footer">
        <div className="wrap-docs docs-footer-inner">
          <span>© 2026 SPHYNX // REFERENCE ARCHITECTURE · NOT INVESTMENT ADVICE</span>
          <span className="docs-footer-links">
            <Link href="/">Home</Link>
            <Link href="/docs/disclaimer">Disclaimer</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
