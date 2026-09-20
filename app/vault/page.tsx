import { redirect } from "next/navigation";

// The standalone Vite vault dApp under /app is superseded by the trade terminal, which does
// deposit / withdraw / redeem in kind plus orders against the live contracts. Keep the URL.
export default function VaultPage() {
  redirect("/trade");
}
