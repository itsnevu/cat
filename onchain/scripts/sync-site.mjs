// After a deploy: copy deployments/latest.json addresses into the dashboard snapshot files so the
// Vault dApp (public/app/vault.html) and the desk mirror point at the live contracts.
//   node onchain/scripts/sync-site.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const d = JSON.parse(readFileSync(join(here, "..", "deployments", "latest.json"), "utf8"));
if (d.stale) {
  console.error("deployments/latest.json is the placeholder; run the deploy first");
  process.exit(1);
}
for (const f of ["public/app/desk-state.json", "public/app/desk-state.example.json"]) {
  const p = join(root, f);
  const s = JSON.parse(readFileSync(p, "utf8"));
  s.onchain = s.onchain ?? {};
  s.onchain.network = { name: "Robinhood Chain", chainId: 4663, deployed: true, explorer: "https://robinhoodchain.blockscout.com" };
  s.onchain._contractsNote = `Robinhood Chain mainnet (4663), block ${d.block}. Mirrors onchain/deployments/latest.json.`;
  s.onchain.contracts = {
    guardrails: d.guardrailConfig,
    vault: d.vault,
    attestor: d.deskRegistry,
    executor: d.executor,
    oracle: d.oracle,
    adapter: d.adapter,
    autosave: null,
  };
  s.onchain.executor = {
    ...(s.onchain.executor ?? {}),
    type: "Scoped session key (EOA)",
    status: "live",
    scope: "guardrail-bounded swaps on Uniswap V3 (USDG/NVDA, USDG/AAPL, USDG/SPY)",
    sessionKey: d.agent,
  };
  writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  console.log("updated", f);
}
