import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { CtaFooter } from "@/components/cta-footer";
import { TradeTerminal } from "@/components/trade/trade-terminal";

export const metadata: Metadata = {
  title: "Trade",
  description:
    "Trade tokenized stocks through the SPHYNX vault on Robinhood Chain. Every order is previewed against the written caps before you sign; the vault reverts any breach.",
};

export default function TradePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <TradeTerminal />
      </main>
      <CtaFooter />
    </>
  );
}
