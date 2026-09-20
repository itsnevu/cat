import type { DocContent } from "./types";

export const content: DocContent = {
  title: "Contracts Reference",
  description:
    "Every SPHYNX contract on Robinhood Chain mainnet (chainId 4663): address, role, owner, the functions you will call, and how to build, test and redeploy from the repo.",
  eyebrow: "23, On-chain · Contracts",
  blocks: [
    {
      type: "prose",
      md: "Deployed 2026-09-20 at block 26,015,235 by `forge script script/Deploy.s.sol:Deploy`. The addresses below are the contents of `onchain/deployments/latest.json`, which the site, the CLI and the dashboard all import. If that file changes, everything follows.",
    },
    {
      type: "table",
      caption: "Robinhood Chain mainnet · chainId 4663 · explorer robinhoodchain.blockscout.com",
      headers: ["Contract", "Address", "Owner"],
      rows: [
        ["RWAVault (vSPHYNX)", "`0x510Af4fC7fA571e5549258541a9374dE3D894F28`", "deployer"],
        ["SessionKeyExecutor", "`0x87a6F83D1375401e1BfFca9e8055228033788713`", "deployer"],
        ["GuardrailConfig", "`0x7Ec7A870361E75A44E5549b57Cd437742e509be2`", "deployer"],
        ["UniswapV3Oracle", "`0xBf4fbd55eB70DC6424d839B9F6fDbc693A63cCe5`", "deployer"],
        ["UniswapV3Adapter", "`0x18bdc0EE9C2d33eeAbC5fe422126310cf3df13bC`", "deployer"],
        ["DeskRegistry", "`0x685915EB0226757bFeae58c5f5BdD3f5F493Eac4`", "none (subject-owned)"],
        ["Deployer / owner / agent", "`0x21BFa4F43D78f388219c0743CCb9dCa98bD1244a`", "EOA"],
      ],
    },
    {
      type: "callout",
      tone: "warn",
      title: "Source not yet verified on Blockscout",
      md: "The explorer's API sits behind a Cloudflare challenge that rejects automated verification. Until it is done through the browser, compare bytecode yourself: `forge build && cast code <addr> | cmp - <(jq -r .deployedBytecode.object out/RWAVault.sol/RWAVault.json)`.",
    },
    {
      type: "heading",
      text: "GuardrailConfig",
    },
    {
      type: "code",
      lang: "solidity",
      code: `function caps() view returns (Caps)   // (perTradeBps, maxConcentrationBps, maxOpenPositions, maxDailyOrders, stopLossBps, dailyLossHaltBps, cashBufferBps)
function setCaps(uint16,uint16,uint8,uint8,uint16,uint16,uint16) onlyOwner

// hard ceilings the owner cannot exceed
MAX_PER_TRADE_BPS      = 5000   // 50%
MAX_CONCENTRATION_BPS  = 5000
MAX_STOP_LOSS_BPS      = 2500   // stop no deeper than 25%
MIN_CASH_BUFFER_BPS    = 500    // at least 5% cash after a buy`,
    },
    {
      type: "table",
      headers: ["Cap", "Launch", "Meaning"],
      rows: [
        ["`perTradeBps`", "1500", "Max single order, % of NAV"],
        ["`maxConcentrationBps`", "2500", "Max % of NAV in one token after the order"],
        ["`maxOpenPositions`", "6", "Distinct tokens held"],
        ["`maxDailyOrders`", "4", "Executed orders per UTC day"],
        ["`stopLossBps`", "800", "A buy's stop must be within 8% below mark"],
        ["`dailyLossHaltBps`", "500", "Buys freeze once NAV is 5% below the day's open"],
        ["`cashBufferBps`", "1000", "Min % of NAV in USDG after a buy"],
      ],
    },
    {
      type: "heading",
      text: "RWAVault",
    },
    {
      type: "code",
      lang: "solidity",
      code: `// ERC-4626 (asset = USDG, shares 12 dec)
deposit(uint256 assets, address receiver) returns (uint256 shares)
mint / withdraw / redeem / previewDeposit / convertToAssets / maxDeposit / maxWithdraw …
redeemInKind(uint256 shares, address receiver) returns (uint256 usdgOut)   // always works

// the riddle
previewTrade(Trade) view returns (Violation)      // enum index, see below
quoteNotional(Trade) view returns (uint256)       // USDG value of an order
executeTrade(Trade) onlyExecutor returns (uint256 amountOut)

// reads
totalAssets() / navUsdg() / usdgBalance() / openPositions() / allowlist()
positions(address) → (costUsdg, stopPriceE18)
positionValue(address) / isAllowed(address) / today() → (day, orders, openNav)
depositCap() / exitFeeBps() / paused() / executor() / oracle() / adapter() / guardrails()

// owner
setExecutor / setOracle / setAdapter / setGuardrails / setDepositCap / setExitFee(≤100) / setAllowed / pause / unpause

struct Trade { address stockToken; bool isBuy; uint256 amountIn; uint256 minAmountOut; uint256 stopPriceE18; bool leftSideException; }
enum Violation { None, Unfunded, DailyLossHalt, PerTradeCap, MaxDailyOrders, Concentration, MaxPositions,
                 CashBuffer, NoAveragingIntoLoser, MissingStop, NotAllowed, ZeroAmount, InsufficientPosition, Paused }`,
    },
    {
      type: "heading",
      text: "SessionKeyExecutor",
    },
    {
      type: "code",
      lang: "solidity",
      code: `execute(Trade) returns (uint256 amountOut)     // caller must hold a live session
sessions(address) → (active, expiry, maxNotionalPerTrade, maxTrades, tradesUsed, maxCumNotional, cumNotionalUsed, buysAllowed, sellsAllowed)
isLive(address) view returns (bool)
tokenAllowed(address agent, address token) view returns (bool)
vault() view returns (address)

// owner
grant(address agent, uint64 expiry, uint256 maxNotionalPerTrade, uint32 maxTrades, uint256 maxCumNotional, bool buys, bool sells, address[] tokens)
revoke(address agent)
setTokenAllowed(address agent, address token, bool)

errors: NoSession SessionExpired SideNotAllowed TokenNotInSession TradeTooLarge TradeCountExhausted BudgetExhausted BadExpiry`,
    },
    {
      type: "heading",
      text: "UniswapV3Oracle · UniswapV3Adapter",
    },
    {
      type: "code",
      lang: "solidity",
      code: `// oracle
priceE18(address token) view returns (uint256)   // 5m TWAP, reverts SpotDeviates / NoPool
spotE18(address token) view returns (uint256)
twapSeconds() / maxSpotDeviationBps() / poolOf(address)
setPool(address token, IUniswapV3Pool) onlyOwner   setParams(uint32, uint16) onlyOwner

// adapter
swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to) returns (uint256)
quote(address tokenIn, address tokenOut, uint256 amountIn) returns (uint256)   // eth_call it
poolOf(address) / usdg()
setPool(address token, IUniswapV3Pool) onlyOwner`,
    },
    {
      type: "heading",
      text: "DeskRegistry",
    },
    {
      type: "code",
      lang: "solidity",
      code: `subjectFor(address owner, bytes32 salt) pure returns (bytes32)
attest(bytes32 salt, uint64 epoch, uint256 nav, int256 realizedPnl, bytes32 snapshotHash, string uri) returns (uint256 index)
attestAs(bytes32 subject, …)                 // for a delegated attester
setAttester(bytes32 salt, address attester)
count(bytes32 subject) / at(bytes32 subject, uint256 i) / latest(bytes32 subject) / attesterOf(bytes32)

// SPHYNX vault subject (seeded at deploy with epoch 0 "sphynx:genesis"):
// salt    = keccak256("sphynx-vault:" ‖ vault)
// subject = 0x0a85fbcdf8264204fe7ff101875e2511923318d68b156a42f0763d36df7c9c0e`,
    },
    {
      type: "prose",
      md: "Anyone can own a subject; SPHYNX's is derived from the deployer and the vault address. Nothing on the registry can be edited or removed. It is the on-chain counterpart of the desk's `logs/*.jsonl`, and the place refusals and vetoes will be published.",
    },
    {
      type: "heading",
      text: "Build, test, deploy",
    },
    {
      type: "code",
      lang: "bash",
      filename: "onchain/",
      code: `forge build
forge test                                            # 29 unit tests on mocks
FORK_RPC=$RPC forge test --mc Fork -vv                # deploys on a mainnet fork, buys + sells NVDA through the real pool

cp .env.example .env                                  # DEPLOYER_PRIVATE_KEY, AGENT_PRIVATE_KEY, AGENT, optional OWNER
forge script script/Deploy.s.sol:Deploy --rpc-url $RPC --broadcast -vv
node scripts/sync-site.mjs                            # addresses → public/app/desk-state.json`,
    },
    {
      type: "prose",
      md: "The deploy script refuses to run off chainId 4663, checks `USDG.decimals() == 6` and that the NVDA pool's `token1()` is NVDA before broadcasting, deploys the six contracts, registers the three pools on both oracle and adapter, allowlists the three tokens, grants the agent a 30-day session, seeds the registry, optionally transfers ownership to `OWNER`, and writes `deployments/latest.json`.",
    },
    {
      type: "heading",
      text: "Repo layout",
    },
    {
      type: "code",
      lang: "text",
      code: `onchain/
├── src/
│   ├── Guardrails.sol            shared types: Caps, Trade, Violation
│   ├── GuardrailConfig.sol
│   ├── RWAVault.sol
│   ├── SessionKeyExecutor.sol
│   ├── UniswapV3Oracle.sol
│   ├── UniswapV3Adapter.sol
│   ├── PostedPriceOracle.sol     alternative owner-fed oracle (not deployed)
│   ├── DeskRegistry.sol
│   ├── interfaces/               IPriceOracle, ISwapAdapter, IUniswapV3
│   ├── libraries/TickMath.sol    port of v3-core sqrt-price math
│   └── mocks/                    MockERC20, MockRouter, MockSwapAdapter (tests only)
├── script/Deploy.s.sol
├── test/Desk.t.sol               29 tests: every Violation, sessions, exits, registry
├── test/Fork.t.sol               mainnet fork round trip
├── deployments/latest.json       the addresses everything reads
├── scripts/sync-site.mjs
└── desk.sh                       read-only CLI`,
    },
  ],
};
