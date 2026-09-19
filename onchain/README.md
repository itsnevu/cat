# SPHYNX on-chain desk

Foundry project. The risk caps the desk reads in prose are enforced here by contracts on Robinhood Chain
mainnet (chainId 4663), against real USDG and the real Uniswap V3 stock-token pools.

| Contract | Role |
|---|---|
| `GuardrailConfig` | The caps as state. Owner-changeable within hard ceilings that nobody can widen. |
| `RWAVault` (vSPHYNX) | ERC-4626 over USDG. `previewTrade()` names the rule an order would break; `executeTrade()` reverts on any breach. Cash withdrawals up to USDG on hand, `redeemInKind()` for the rest, always, even when paused. No fees except an optional exit fee (max 1%) that stays with remaining holders. |
| `SessionKeyExecutor` | The agent's only door. Expiring session scoped by per-trade size, budget, trade count, side and ticker. A refused order reverts, so it spends no budget. |
| `UniswapV3Adapter` | The vault's only execution surface: a typed swap straight against an owner-registered V3 pool. No router, no arbitrary calldata. |
| `UniswapV3Oracle` | 5-minute TWAP from the same pools; refuses to answer when spot is more than 3% off the average. |
| `DeskRegistry` | Append-only attestations (NAV, PnL, snapshot hash, URI). Nothing can be edited or pruned. |

Verified periphery (direct calls, 2026-09-20): USDG `0x5fc5...d168` (6 dec), V3 factory `0x1f7d...2EfA`,
pools USDG/NVDA `0xd4EB...14a3` (~3.7M USDG), USDG/AAPL `0xAae0...2d6D` (~356k), USDG/SPY `0xa7Bb...9167` (~496k).

## Test

```sh
forge test                                        # 29 unit tests on mocks
FORK_RPC=$ROBINHOOD_RPC_URL forge test --mc Fork  # buys and sells NVDA on a mainnet fork through the real pool
```

## Deploy

```sh
cp .env.example .env               # fill DEPLOYER_PRIVATE_KEY, AGENT_PRIVATE_KEY, AGENT
forge script script/Deploy.s.sol:Deploy --rpc-url $ROBINHOOD_RPC_URL --broadcast -vv
node scripts/sync-site.mjs         # push the new addresses into the dashboard snapshot
cd .. && ./deploy/deploy.sh --fast # rebuild the site on the server (lib/chain.ts imports latest.json)
```

Verify on Blockscout afterwards (any non-empty key works), one per contract:

```sh
forge verify-contract --chain 4663 --verifier blockscout \
  --verifier-url https://robinhoodchain.blockscout.com/api <address> src/RWAVault.sol:RWAVault
```

## Use

Read-only checks need no key:

```sh
./desk.sh status
./desk.sh price NVDA
./desk.sh quote NVDA 100
./desk.sh preview buy NVDA 50          # -> None means the caps allow it
./desk.sh calldata buy NVDA 50         # prints the exact cast send for the agent key
```

Transactions are plain `cast send` calls you run with your own keys:

```sh
# fund the vault (deployer wallet needs USDG)
cast send --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY $USDG 'approve(address,uint256)' $VAULT 500000000
cast send --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY $VAULT 'deposit(uint256,address)' 500000000 $YOUR_ADDRESS

# trade under the agent session (copy the line `./desk.sh calldata ...` prints)
cast send --rpc-url $RPC --private-key $AGENT_PRIVATE_KEY $EXECUTOR 'execute((address,bool,uint256,uint256,uint256,bool))' '(...)'

# put a run on the record
cast send --rpc-url $RPC --private-key $DEPLOYER_PRIVATE_KEY $REGISTRY \
  'attest(bytes32,uint64,uint256,int256,bytes32,string)' $SALT 1 500000000 0 $(cast keccak run-1) run-1
```

The site's `/refusals` page and `/api/chain` read caps, session, registry and `previewTrade()` from these
addresses. The vault dApp at `/vault` reads `onchain.contracts.vault` from `public/app/desk-state.json`.

## What is not here

No third-party audit. No timelock on owner actions. Spot-manipulation defence is TWAP plus a deviation
bound, not a Chainlink feed (there is none for these tokens on this chain). Start with a small deposit cap.
