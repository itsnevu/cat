#!/usr/bin/env bash
# SPHYNX on-chain desk: read-only checks over deployments/latest.json (no key needed).
#
#   ./desk.sh status                        caps, vault, session, registry count
#   ./desk.sh price NVDA                    TWAP + spot (USDG per token)
#   ./desk.sh quote NVDA 100                how much NVDA 100 USDG buys right now (simulated)
#   ./desk.sh preview buy NVDA 100 [stop]   which rule the order would break (None = allowed)
#   ./desk.sh preview sell NVDA 0.25
#   ./desk.sh calldata buy NVDA 100 [stop] [slip%]   prints the exact `cast send` for the agent to run
#   ./desk.sh calldata sell NVDA 0.25 [slip%]
#
# Env (onchain/.env): ROBINHOOD_RPC_URL
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
RPC="${ROBINHOOD_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
D=deployments/latest.json
j() { python -c "import json;print(json.load(open('$D'))['$1'])"; }
VAULT=$(j vault); EXEC=$(j executor); CFG=$(j guardrailConfig); ORACLE=$(j oracle); ADAPTER=$(j adapter)
REG=$(j deskRegistry); SUBJ=$(j registrySubject); USDG=$(j usdg)
tok() { case "${1^^}" in NVDA) j nvda;; AAPL) j aapl;; SPY) j spy;; *) echo "unknown token $1" >&2; exit 1;; esac; }
usdg6() { python -c "print(int(round(float('$1')*1e6)))"; }
e18() { python -c "print(int(round(float('$1')*1e18)))"; }
first() { cut -d' ' -f1; }
fmt6() { python -c "print(f'{int(\"$1\")/1e6:,.2f}')"; }
fmt18() { python -c "print(f'{int(\"$1\")/1e18:,.6f}')"; }
call() { cast call --rpc-url "$RPC" "$@"; }
tuple() { echo "($1,$2,$3,$4,$5,false)"; }
NAMES=(None Unfunded DailyLossHalt PerTradeCap MaxDailyOrders Concentration MaxPositions CashBuffer NoAveragingIntoLoser MissingStop NotAllowed ZeroAmount InsufficientPosition Paused)

build() { # side token amount [stop] [slip] -> echoes the trade tuple, sets MIN/STOP
  local side=$1 t; t=$(tok "$2")
  if [ "$side" = buy ]; then
    local amt; amt=$(usdg6 "$3")
    local px; px=$(call $ORACLE 'priceE18(address)(uint256)' $t | first)
    STOP=${4:-$(python -c "print(int($px*0.95))")}
    local q; q=$(call $ADAPTER 'quote(address,address,uint256)(uint256)' $USDG $t $amt | first)
    MIN=$(python -c "print(int($q*(100-${5:-1})/100))")
    tuple $t true $amt $MIN $STOP
  else
    local units; units=$(e18 "$3")
    local q; q=$(call $ADAPTER 'quote(address,address,uint256)(uint256)' $t $USDG $units | first)
    MIN=$(python -c "print(int($q*(100-${4:-1})/100))"); STOP=0
    tuple $t false $units $MIN 0
  fi
}

cmd="${1:-status}"; shift || true
case "$cmd" in
  status)
    echo "vault      $VAULT   paused=$(call $VAULT 'paused()(bool)')"
    echo "  NAV      $(fmt6 "$(call $VAULT 'totalAssets()(uint256)' | first)") USDG   cap $(fmt6 "$(call $VAULT 'depositCap()(uint256)' | first)") USDG"
    echo "  cash     $(fmt6 "$(call $VAULT 'usdgBalance()(uint256)' | first)") USDG   open positions $(call $VAULT 'openPositions()(uint256)' | first)"
    echo "caps       $(call $CFG 'caps()((uint16,uint16,uint8,uint8,uint16,uint16,uint16))')"
    echo "session    $(call $EXEC 'sessions(address)(bool,uint64,uint256,uint32,uint32,uint256,uint256,bool,bool)' "$(j agent)" | tr '\n' ' ')"
    echo "registry   $(call $REG 'count(bytes32)(uint256)' "$SUBJ" | first) attestations";;
  price)
    t=$(tok "$1"); echo "TWAP $(fmt18 "$(call $ORACLE 'priceE18(address)(uint256)' $t | first)")   spot $(fmt18 "$(call $ORACLE 'spotE18(address)(uint256)' $t | first)") USDG per ${1^^}";;
  quote)
    t=$(tok "$1"); echo "$2 USDG -> $(fmt18 "$(call $ADAPTER 'quote(address,address,uint256)(uint256)' $USDG $t "$(usdg6 "$2")" | first)") ${1^^}";;
  preview)
    tup=$(build "$@"); v=$(call $VAULT 'previewTrade((address,bool,uint256,uint256,uint256,bool))(uint8)' "$tup" | first)
    echo "previewTrade -> ${NAMES[$v]}   (tuple $tup)";;
  calldata)
    tup=$(build "$@"); v=$(call $VAULT 'previewTrade((address,bool,uint256,uint256,uint256,bool))(uint8)' "$tup" | first)
    echo "# previewTrade -> ${NAMES[$v]}; min out $MIN; stop $STOP"
    echo "cast send --rpc-url $RPC --private-key \$AGENT_PRIVATE_KEY $EXEC 'execute((address,bool,uint256,uint256,uint256,bool))' '$tup'";;
  *) sed -n 2,12p "$0"; exit 1;;
esac
