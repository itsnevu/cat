import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Session Keys",
  description:
    "SessionKeyExecutor: the agent never holds a standing wallet over the book. It holds an expiring session scoped by per-trade size, total budget, trade count, side and ticker, and a refused order spends none of it.",
  eyebrow: "21, On-chain · Session keys",
  blocks: [
    {
      type: "prose",
      md: "The desk's AI agent needs to be able to trade without a human signing every transaction, and that is exactly the situation where a hot wallet is dangerous. `SessionKeyExecutor` is the answer: the vault trusts **one** address, the executor, and the executor only forwards orders that fit inside a **session** the owner granted to the caller.",
    },
    {
      type: "diagram",
      title: "Two doors, one rulebook",
      ascii: `OWNER (deployer / Safe) ──grant(agent, expiry, caps…)──▶ SessionKeyExecutor
                                                              │
AGENT KEY ──execute(trade)──▶ session checks ─────────────────┤
                                                              ▼
                                              RWAVault.executeTrade(trade)  ◀── onlyExecutor
                                                              │
                                              guardrail checks (previewTrade)
                                                              │
                                              UniswapV3Adapter → pool`,
    },
    {
      type: "heading",
      text: "What a session is",
    },
    {
      type: "code",
      lang: "solidity",
      filename: "SessionKeyExecutor.sol",
      code: `struct Session {
    bool    active;
    uint64  expiry;               // unix seconds; execute() reverts at or after this
    uint256 maxNotionalPerTrade;  // USDG, 6 dec
    uint32  maxTrades;
    uint32  tradesUsed;
    uint256 maxCumNotional;       // USDG, 6 dec: total budget across the session
    uint256 cumNotionalUsed;
    bool    buysAllowed;
    bool    sellsAllowed;
}
mapping(address => Session) public sessions;
mapping(address => mapping(address => bool)) public tokenAllowed;  // agent => token => ok`,
    },
    {
      type: "deflist",
      items: [
        { term: "Expiry", md: "Hard stop. A compromised key is worth nothing after it. The launch session runs 30 days." },
        { term: "Per-trade notional", md: "The most one order can be worth in USDG. Buys are measured by `amountIn`; sells by `units × oracle price`. Launch: 1,500 USDG." },
        { term: "Budget", md: "Cumulative notional across the whole session. Launch: 20,000 USDG. When it is spent, the session is dead until re-granted." },
        { term: "Trade count", md: "Launch: 40. A second, independent ceiling on how much damage a runaway loop could do." },
        { term: "Sides", md: "Buys and sells can be granted separately. A sell-only session is a useful shape for a wind-down key." },
        { term: "Ticker allowlist", md: "Per agent, per token. A key scoped to NVDA cannot touch AAPL even though the vault allows both." },
      ],
    },
    {
      type: "heading",
      text: "Execute, and why refusals are free",
    },
    {
      type: "code",
      lang: "solidity",
      code: `function execute(Guardrails.Trade calldata t) external returns (uint256 amountOut) {
    Session storage s = sessions[msg.sender];
    if (!s.active) revert NoSession();
    if (block.timestamp >= s.expiry) revert SessionExpired();
    if (t.isBuy ? !s.buysAllowed : !s.sellsAllowed) revert SideNotAllowed();
    if (!tokenAllowed[msg.sender][t.stockToken]) revert TokenNotInSession();
    if (s.tradesUsed >= s.maxTrades) revert TradeCountExhausted();

    uint256 notional = vault.quoteNotional(t);
    if (notional > s.maxNotionalPerTrade) revert TradeTooLarge();
    if (s.cumNotionalUsed + notional > s.maxCumNotional) revert BudgetExhausted();

    amountOut = vault.executeTrade(t);      // reverts GuardrailBreach(rule) on any cap
    s.tradesUsed += 1;                      // only reached on a fill
    s.cumNotionalUsed += notional;
    emit Executed(msg.sender, t.stockToken, t.isBuy, notional, amountOut);
}`,
    },
    {
      type: "prose",
      md: "The counters are incremented **after** the vault call. If the vault reverts, the EVM unwinds the whole transaction, so `tradesUsed` and `cumNotionalUsed` are exactly what they were. This is what \"a refused order spends none of the budget\" means mechanically, and it is tested in `test/Desk.t.sol` and on a mainnet fork in `test/Fork.t.sol`.",
    },
    {
      type: "heading",
      text: "Granting and revoking",
    },
    {
      type: "code",
      lang: "bash",
      code: `# owner grants a 7-day session: 500 USDG/trade, 20 trades, 5,000 USDG budget, buys+sells, NVDA+SPY
cast send $EXECUTOR 'grant(address,uint64,uint256,uint32,uint256,bool,bool,address[])' \\
  $AGENT $(( $(date +%s) + 7*86400 )) 500000000 20 5000000000 true true "[$NVDA,$SPY]" \\
  --private-key $OWNER_KEY --rpc-url $RPC

# kill it now
cast send $EXECUTOR 'revoke(address)' $AGENT --private-key $OWNER_KEY --rpc-url $RPC

# is it live? (active, not expired, count + budget left)
cast call $EXECUTOR 'isLive(address)(bool)' $AGENT --rpc-url $RPC`,
    },
    {
      type: "prose",
      md: "`grant()` **replaces** the session and resets both counters. `revoke()` flips `active` off; the counters stay readable for the record. There is one session per address; to run two agents, use two keys.",
    },
    {
      type: "heading",
      text: "Operational advice",
    },
    {
      type: "list",
      items: [
        "Make the agent key with `cast wallet new` and give it **only** ETH for gas. It should never hold USDG or tokens; it moves the vault's assets, not its own.",
        "Size the budget to the strategy, not the vault. A session should be able to run out.",
        "Prefer short expiries and re-grant on a schedule. The cost is one owner transaction.",
        "The executor's owner is the same as the vault's. Move both to a Safe when there is money at stake; `Ownable2Step` means the Safe has to accept.",
        "Anyone can call `previewTrade()` and `quote()`. Only the session holder can `execute()`. The [Trade terminal](/trade) enables the sign button only for a live session.",
      ],
    },
    {
      type: "note",
      md: "The launch session is granted to the deployer address itself, which is also the owner. That is fine for a first trade and wrong for production: separate the keys before scaling deposits. See [Risks](/docs/risks).",
    },
  ],
};
