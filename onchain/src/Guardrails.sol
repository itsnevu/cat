// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Guardrails
/// @notice Shared types for the SPHYNX on-chain desk: the risk caps and the reason an order is refused.
library Guardrails {
    /// @dev Index order is load-bearing: the site decodes `previewTrade()` by this enum's position.
    enum Violation {
        None,
        Unfunded,
        DailyLossHalt,
        PerTradeCap,
        MaxDailyOrders,
        Concentration,
        MaxPositions,
        CashBuffer,
        NoAveragingIntoLoser,
        MissingStop,
        NotAllowed,
        ZeroAmount,
        InsufficientPosition,
        Paused
    }

    /// @notice Risk caps, all percentages in basis points of NAV unless stated.
    struct Caps {
        uint16 perTradeBps;         // max single order notional as % of NAV
        uint16 maxConcentrationBps; // max % of NAV in one token after the order
        uint8 maxOpenPositions;     // max distinct tokens held
        uint8 maxDailyOrders;       // max executed orders per UTC day
        uint16 stopLossBps;         // a buy's stop must sit within this % below price
        uint16 dailyLossHaltBps;    // buys freeze once the day's NAV drawdown crosses this
        uint16 cashBufferBps;       // min % of NAV that must remain in USDG after a buy
    }

    /// @notice One order, as the executor hands it to the vault.
    struct Trade {
        address stockToken;
        bool isBuy;
        uint256 amountIn;       // buys: USDG (6 dec) to spend; sells: stock-token units (18 dec) to sell
        uint256 minAmountOut;   // slippage floor, in the output token's units
        uint256 stopPriceE18;   // buys only: stop price in USDG per token, 18 dec fixed point
        bool leftSideException; // written left-side plan applies (allows adding to a loser)
    }

    error GuardrailBreach(Violation violation);
}
