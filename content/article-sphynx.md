# SPHYNX: An AI Research Desk That Works 24/7 but Never Trades Without Your Yes

Markets never close anymore. With tokenized stocks on Robinhood Chain, a trade can happen at any hour, and a swap is a single click. The problem is that humans still need sleep. SPHYNX was built for that gap: an AI research desk that studies the market around the clock, then stops right before the "buy" button, because the final decision is always yours.

## Not a bot, a team of analysts

Most "trading bots" are one large prompt handed full access to an account. SPHYNX takes a different approach. It runs inside Claude Code and behaves like a small institutional desk with clearly separated roles:

- **The Portfolio Manager** is the main Claude Code session you talk to. It is the only role that holds order tools.
- **Three specialist analysts** (Fundamental, Technical, and Macro/News) screen your watchlist and research each candidate in parallel. All three are read-only.
- **An independent Risk Manager** reviews every proposal and returns one of three verdicts: APPROVE, APPROVE-WITH-CHANGES, or VETO. A veto stops the run on the spot.

Each role is just a Markdown file in the `.claude/agents/` folder. The tools each role may use are listed in that file's frontmatter, so anyone can open it and verify for themselves that the analysts hold no order tools.

## One desk run, from sense to snapshot

A request flows through ten steps: Sense, Screen, Research, Synthesize, Risk, Preview, Approval, Execute, Confirm, and Snapshot. The first six are pure research and never produce an order. Their output is a **preview card**: a single proposed trade tied to a written rule in the `strategies/` folder, complete with the reasoning and the Risk Manager's verdict.

At that point the desk stops and waits. An order only goes to Robinhood after you say "yes", and even then a `deny → ask → allow` permission gate in Claude Code's settings asks for confirmation one more time. The kill switch is a single command: removing the MCP connection to Robinhood.

## An architecture that is deliberately small

There is no backend server, no Python orchestrator, no database, and no Docker. The broker is reached through one MCP server from Robinhood Agentic, authenticated with OAuth inside the session. State lives in a single JSON snapshot plus append-only JSONL logs. The Vite and React dashboard only reads that snapshot and cannot place orders.

This is not just about simplicity. Fewer components mean fewer places for bugs or attackers to hide. The news analyst, for example, is specifically isolated against prompt injection, because articles on the open internet are the easiest entry point for malicious instructions.

## From written rules to on-chain code

On the other side of SPHYNX is a separate module already deployed to Robinhood Chain mainnet (chainId 4663). On the desk, risk rules are *read* by an agent. On chain, they are *enforced* by a contract. There are three layers:

1. **SessionKeyExecutor**: the agent never holds a standing hot wallet. It trades through an expiring session key bounded by per-trade size, total budget, trade count, and a ticker allowlist.
2. **RWAVault and GuardrailConfig**: an ERC-4626 vault over USDG that reverts any order breaching the risk caps. The `previewTrade()` function reports which rule an order would break before anyone signs.
3. **DeskRegistry**: an append-only attestation log. Refusals and vetoes are recorded permanently and cannot be pruned.

There are no management fees, performance fees, or carry anywhere in the contracts. The entire stack is owned by a 2-of-3 Safe multisig.

## Honest about the limits

What sets SPHYNX apart from similar projects is how openly it states what does not exist yet. The contracts have no third-party audit. Deposits are capped at 10,000 USDG, TVL is zero, there are no depositors, no track record, and no timelock on parameter changes. The $SPHYNX token has not been built. The on-chain module is also not wired into the desk's trading path; every stock order still goes through Robinhood and through your approval.

The first metric the team intends to publish is not returns, but how often the vault said "no". At zero TVL, that is the only number that can be collected honestly.

## Who SPHYNX is for

SPHYNX suits traders who want systematic, layered research without handing control of their account to a machine. Access is currently by request, involves real money, and is not investment advice. Full documentation, from quickstart to the on-chain architecture, lives at sphynxagent.xyz/docs.

Markets never close now. With SPHYNX, neither does the gatekeeper.
