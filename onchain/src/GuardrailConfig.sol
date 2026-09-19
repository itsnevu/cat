// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Guardrails} from "./Guardrails.sol";

/// @title GuardrailConfig
/// @notice The risk caps as chain state. The vault reads them on every order; only the owner can move them,
///         and a few ceilings cannot be widened by anyone.
contract GuardrailConfig is Ownable2Step {
    /// @dev Hard ceilings. The owner may tighten below these, never loosen above them.
    uint16 public constant MAX_PER_TRADE_BPS = 5_000;       // 50% of NAV
    uint16 public constant MAX_CONCENTRATION_BPS = 5_000;   // 50% of NAV
    uint16 public constant MAX_STOP_LOSS_BPS = 2_500;       // stop no deeper than 25% below price
    uint16 public constant MIN_CASH_BUFFER_BPS = 500;       // at least 5% cash after a buy

    Guardrails.Caps private _caps;

    event CapsUpdated(Guardrails.Caps caps);

    error CapOutOfRange(string which);

    constructor(address owner_, Guardrails.Caps memory initial) Ownable(owner_) {
        _set(initial);
    }

    /// @notice The live caps, as one struct.
    function caps() external view returns (Guardrails.Caps memory) {
        return _caps;
    }

    /// @notice Replace every cap at once. Reverts if any cap breaches a hard ceiling.
    function setCaps(
        uint16 perTradeBps,
        uint16 maxConcentrationBps,
        uint8 maxOpenPositions,
        uint8 maxDailyOrders,
        uint16 stopLossBps,
        uint16 dailyLossHaltBps,
        uint16 cashBufferBps
    ) external onlyOwner {
        _set(
            Guardrails.Caps({
                perTradeBps: perTradeBps,
                maxConcentrationBps: maxConcentrationBps,
                maxOpenPositions: maxOpenPositions,
                maxDailyOrders: maxDailyOrders,
                stopLossBps: stopLossBps,
                dailyLossHaltBps: dailyLossHaltBps,
                cashBufferBps: cashBufferBps
            })
        );
    }

    function _set(Guardrails.Caps memory c) internal {
        if (c.perTradeBps == 0 || c.perTradeBps > MAX_PER_TRADE_BPS) revert CapOutOfRange("perTradeBps");
        if (c.maxConcentrationBps == 0 || c.maxConcentrationBps > MAX_CONCENTRATION_BPS) {
            revert CapOutOfRange("maxConcentrationBps");
        }
        if (c.maxOpenPositions == 0) revert CapOutOfRange("maxOpenPositions");
        if (c.maxDailyOrders == 0) revert CapOutOfRange("maxDailyOrders");
        if (c.stopLossBps == 0 || c.stopLossBps > MAX_STOP_LOSS_BPS) revert CapOutOfRange("stopLossBps");
        if (c.dailyLossHaltBps == 0 || c.dailyLossHaltBps > 10_000) revert CapOutOfRange("dailyLossHaltBps");
        if (c.cashBufferBps < MIN_CASH_BUFFER_BPS || c.cashBufferBps > 10_000) revert CapOutOfRange("cashBufferBps");
        _caps = c;
        emit CapsUpdated(c);
    }
}
