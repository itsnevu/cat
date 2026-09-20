import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Trading Guide",
  description:
    "How to trade tokenized stocks through the SPHYNX vault on Robinhood Chain: connect, fund, compose an order, read the vault's verdict, sign. Every order is previewed against the written caps before anything is spent.",
  eyebrow: "19, On-chain · Trading",
  blocks: [
    {
      type: "prose",
      md: "The [Trade terminal](/trade) is the front door to the on-chain desk. It reads the contracts on Robinhood Chain mainnet (chainId 4663) directly and sends every write through your own wallet. Nothing on the page is a database: prices come from the Uniswap V3 pools, caps from `GuardrailConfig`, the book from the vault's balances, the history from its events.",
    },
    {
      type: "callout",
      tone: "danger",
      title: "Real money · unaudited · not investment advice",
      md: "The vault holds real USDG and real Stock Tokens. The contracts have no third-party audit and the owner has no timelock. Stock Tokens are price-tracking instruments, **not shares**, and are **not for US persons**. Trade only what you can lose.",
    },
    {
      type: "heading",
      text: "What you need",
    },
    {
      type: "list",
      items: [
        "An EVM wallet (MetaMask, Rabby, Coinbase Wallet) with **Robinhood Chain** added. The terminal offers to add it: chainId `4663`, RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `robinhoodchain.blockscout.com`.",
        "A little **ETH on Robinhood Chain** for gas. A trade costs well under a cent; bridge from Arbitrum or Ethereum through the official bridge.",
        "**USDG** (Global Dollar, `0x5fc5…d168`, 6 decimals) to deposit. Swap ETH for USDG on any DEX on the chain, or bridge it.",
        "To **execute orders** (not just deposit), a wallet that holds a **session** from the owner. Without one you can preview everything but the sign button stays disabled. See [Session Keys](/docs/session-keys).",
      ],
    },
    {
      type: "heading",
      text: "The screen, top to bottom",
    },
    {
      type: "steps",
      steps: [
        { label: "01", title: "Markets strip", md: "One tile per allowlisted token (NVDA, AAPL, SPY). The big number is the **5-minute TWAP** from the token's USDG pool, the mark the vault values everything at. Under it, how far spot has drifted from that mark. Click a tile to load it into the ticket." },
        { label: "02", title: "Vault KPIs", md: "NAV in USDG, cash on hand and how much of NAV it is, the vSPHYNX share price, and today's order count against the daily cap." },
        { label: "03", title: "Book", md: "**Positions**: units held, average cost, mark, value, unrealised P&L, weight of NAV, and the stop set on the last buy. **Trades**: every `TradeExecuted` event with a link to the transaction. **Deposits**: every deposit, withdrawal and in-kind redemption." },
        { label: "04", title: "Guardrails headroom", md: "The seven caps read live from `GuardrailConfig.caps()`, each with a meter showing how close the book is to the line. A meter turns red past 85%." },
        { label: "05", title: "Session key", md: "The agent's session from `SessionKeyExecutor.sessions()`: live or not, expiry countdown, per-trade cap, trades used, budget spent, which sides are allowed." },
        { label: "06", title: "Order ticket", md: "Buy or sell, amount, stop, slippage, left-side flag. As you type, the terminal asks the vault `previewTrade()` and the adapter `quote()` and shows both. The sign button only enables when the verdict is **None**." },
        { label: "07", title: "Vault panel", md: "Your shares and what they are worth, wallet USDG, how much cash you could withdraw right now. Deposit (approve + deposit, two signatures) or withdraw cash, or redeem everything in kind." },
      ],
    },
    {
      type: "heading",
      text: "Composing a buy",
    },
    {
      type: "prose",
      md: "A buy spends USDG and receives the stock token. The ticket needs four things and fills three of them for you.",
    },
    {
      type: "deflist",
      items: [
        { term: "Spend (USDG)", md: "Type a number or tap 25/50/75/100% of the **per-trade cap**, which is `perTradeBps` of NAV (15% at launch). Anything above it will preview as `PerTradeCap`." },
        { term: "Stop below entry", md: "Every buy must carry a stop below the mark, and no deeper than `stopLossBps` (8%). The slider defaults to 5%. A stop of zero, above the mark, or too deep previews as `MissingStop`. The stop is recorded on the position; it is a written commitment, the vault does not auto-sell." },
        { term: "Max slippage", md: "The quote from the pool, minus this, becomes `minAmountOut`. If the pool moves against you between preview and inclusion, the swap reverts instead of filling worse. Default 1%." },
        { term: "Left-side plan", md: "Off by default. Adding to a position that is below its average cost previews as `NoAveragingIntoLoser` unless this flag is on, which asserts a written left-side plan applies. Use it deliberately." },
      ],
    },
    {
      type: "heading",
      text: "Reading the verdict",
    },
    {
      type: "prose",
      md: "`previewTrade()` returns one of fourteen values. The terminal shows the name and a one-line reason. The same function runs inside `executeTrade()`, so a preview of **None** and a fill are the same check at two moments; the only thing that can change between them is the chain itself (a price move, another order landing first).",
    },
    {
      type: "table",
      headers: ["Verdict", "Means", "What to change"],
      rows: [
        ["`None`", "Passes every cap.", "Sign it."],
        ["`Unfunded`", "NAV is zero.", "Deposit first."],
        ["`PerTradeCap`", "Order is more than `perTradeBps` of NAV.", "Smaller amount."],
        ["`Concentration`", "After the order, this token would exceed `maxConcentrationBps` of NAV.", "Smaller amount or a different token."],
        ["`MaxPositions`", "Opening this token would exceed `maxOpenPositions`.", "Close something first."],
        ["`MaxDailyOrders`", "Today's order count is used up.", "Wait for the next UTC day."],
        ["`CashBuffer`", "The buy would leave less than `cashBufferBps` of NAV in USDG.", "Smaller amount."],
        ["`MissingStop`", "No stop, stop above mark, or stop deeper than `stopLossBps`.", "Move the stop slider."],
        ["`DailyLossHalt`", "NAV is down more than `dailyLossHaltBps` from the day's opening NAV.", "Buys are frozen today; sells still work."],
        ["`NoAveragingIntoLoser`", "Adding to a position below its average cost.", "Turn on left-side plan, or don't."],
        ["`NotAllowed`", "Token is not allowlisted.", "Pick a listed token."],
        ["`InsufficientPosition`", "Selling more than the vault holds.", "Smaller amount."],
        ["`ZeroAmount`", "Amount is zero.", "Enter an amount."],
        ["`Paused`", "The owner paused the vault.", "Wait; redeem in kind still works."],
      ],
    },
    {
      type: "heading",
      text: "Signing and what happens on chain",
    },
    {
      type: "diagram",
      title: "One buy, end to end",
      ascii: `YOUR WALLET ──execute(trade)──▶ SessionKeyExecutor
                                   │ session live? side allowed? token in session?
                                   │ notional ≤ per-trade cap? budget left? count left?
                                   ▼
                                RWAVault.executeTrade(trade)
                                   │ previewTrade(trade) == None   ◀── else revert GuardrailBreach(rule)
                                   │ day counters, approve adapter
                                   ▼
                                UniswapV3Adapter.swap(USDG → token)
                                   │ pool.swap(...) with minAmountOut floor
                                   ▼
                                Uniswap V3 pool (USDG/token, 0.05%)
                                   │ tokens land in the vault
                                   ▼
                                vault records cost basis + stop · emits TradeExecuted
                                executor bumps tradesUsed + cumNotionalUsed · emits Executed`,
    },
    {
      type: "prose",
      md: "If anything in that chain reverts, the whole transaction reverts. The vault's counters do not move, the session's budget is not spent, and the reason is in the revert data: `GuardrailBreach(Violation)` from the vault, or a named error from the executor (`TradeTooLarge`, `BudgetExhausted`, `SessionExpired`, …).",
    },
    {
      type: "heading",
      text: "Selling",
    },
    {
      type: "prose",
      md: "A sell spends stock-token units and receives USDG. Tap **held** to sell the whole position or use the percentage buttons. Sells carry no stop and ignore the cash buffer, concentration and per-trade caps: reducing risk is never refused by a risk cap. The only checks are `InsufficientPosition`, `MaxDailyOrders`, `NotAllowed`, `Paused` and the session's own limits. Selling the whole position clears its cost basis and stop.",
    },
    {
      type: "heading",
      text: "Depositing and leaving",
    },
    {
      type: "deflist",
      items: [
        { term: "Deposit", md: "Two signatures: `USDG.approve(vault, amount)` then `vault.deposit(amount, you)`. You receive vSPHYNX shares (12 decimals) at the current share price. Deposits are refused above `depositCap` or while paused." },
        { term: "Withdraw cash", md: "`vault.withdraw(usdg, you, you)` burns shares for USDG. Limited to the USDG the vault actually holds: if the book is mostly tokens, the withdrawable cash is small. The terminal shows the number." },
        { term: "Redeem in kind", md: "`vault.redeemInKind(shares, you)` burns shares for your pro-rata slice of **everything**: cash plus each token, minus the exit fee. Always available, even when paused, even if the owner disappears. This is the guarantee that your money is never stuck behind an admin." },
      ],
    },
    {
      type: "note",
      md: "The exit fee (0% at launch, max 1%) stays in the vault for remaining holders. There is no management fee, no performance fee and no carry anywhere in the contracts.",
    },
    {
      type: "heading",
      text: "From the command line",
    },
    {
      type: "prose",
      md: "Everything the terminal does is a `cast` call. The repo ships `onchain/desk.sh` for read-only checks and prints the exact `cast send` for an order:",
    },
    {
      type: "code",
      lang: "bash",
      filename: "onchain/",
      code: `./desk.sh status                  # NAV, cash, caps, session, registry
./desk.sh price NVDA              # TWAP + spot
./desk.sh quote NVDA 100          # what 100 USDG buys right now
./desk.sh preview buy NVDA 50     # the vault's verdict
./desk.sh calldata buy NVDA 50    # prints: cast send ... execute((...))`,
    },
    {
      type: "prose",
      md: "Addresses live in `onchain/deployments/latest.json`; the site and the CLI read the same file. Full reference in [Contracts](/docs/contracts).",
    },
  ],
};
