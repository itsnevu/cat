import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CtaFooter } from "@/components/cta-footer";
import { RefusalsBoard } from "@/components/refusals-board";

export const metadata: Metadata = {
  title: "Refusals",
  description:
    "We publish our no's. Live reads from the SPHYNX contracts on Robinhood Chain mainnet: the caps the agent trades under, the scoped session key it holds, the append-only record of refusals — and previewTrade(), the riddle itself.",
};

export default function RefusalsPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <RefusalsBoard />
      </main>
      <CtaFooter />
    </>
  );
}
