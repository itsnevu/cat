// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Guardrails} from "./Guardrails.sol";
import {RWAVault} from "./RWAVault.sol";

/// @title SessionKeyExecutor
/// @notice The authorization layer between the AI desk and the vault. The agent never holds a standing
///         hot wallet over the book: it holds an expiring session, scoped by size, budget, count, side and
///         ticker. A rejected order reverts the whole transaction, so it spends none of the budget.
contract SessionKeyExecutor is Ownable2Step {
    struct Session {
        bool active;
        uint64 expiry;
        uint256 maxNotionalPerTrade; // USDG, 6 dec
        uint32 maxTrades;
        uint32 tradesUsed;
        uint256 maxCumNotional; // USDG, 6 dec
        uint256 cumNotionalUsed;
        bool buysAllowed;
        bool sellsAllowed;
    }

    RWAVault public immutable vault;
    mapping(address => Session) public sessions;
    mapping(address => mapping(address => bool)) public tokenAllowed; // agent => stock token => allowed

    event SessionGranted(
        address indexed agent,
        uint64 expiry,
        uint256 maxNotionalPerTrade,
        uint32 maxTrades,
        uint256 maxCumNotional,
        bool buys,
        bool sells,
        address[] tokens
    );
    event SessionRevoked(address indexed agent);
    event Executed(address indexed agent, address indexed token, bool isBuy, uint256 notional, uint256 amountOut);

    error NoSession();
    error SessionExpired();
    error SideNotAllowed();
    error TokenNotInSession();
    error TradeTooLarge();
    error TradeCountExhausted();
    error BudgetExhausted();
    error BadExpiry();

    constructor(address owner_, RWAVault vault_) Ownable(owner_) {
        vault = vault_;
    }

    /// @notice Grant (or replace) a session. Counters reset.
    function grant(
        address agent,
        uint64 expiry,
        uint256 maxNotionalPerTrade,
        uint32 maxTrades,
        uint256 maxCumNotional,
        bool buysAllowed,
        bool sellsAllowed,
        address[] calldata tokens
    ) external onlyOwner {
        if (expiry <= block.timestamp) revert BadExpiry();
        sessions[agent] = Session({
            active: true,
            expiry: expiry,
            maxNotionalPerTrade: maxNotionalPerTrade,
            maxTrades: maxTrades,
            tradesUsed: 0,
            maxCumNotional: maxCumNotional,
            cumNotionalUsed: 0,
            buysAllowed: buysAllowed,
            sellsAllowed: sellsAllowed
        });
        for (uint256 i = 0; i < tokens.length; i++) tokenAllowed[agent][tokens[i]] = true;
        emit SessionGranted(
            agent, expiry, maxNotionalPerTrade, maxTrades, maxCumNotional, buysAllowed, sellsAllowed, tokens
        );
    }

    function setTokenAllowed(address agent, address token, bool allowed) external onlyOwner {
        tokenAllowed[agent][token] = allowed;
    }

    function revoke(address agent) external onlyOwner {
        sessions[agent].active = false;
        emit SessionRevoked(agent);
    }

    /// @notice True when `agent` could trade right now (ignoring per-order caps).
    function isLive(address agent) external view returns (bool) {
        Session storage s = sessions[agent];
        return s.active && block.timestamp < s.expiry && s.tradesUsed < s.maxTrades
            && s.cumNotionalUsed < s.maxCumNotional;
    }

    /// @notice Execute one order under the caller's session. Reverts on any breach, session or vault.
    function execute(Guardrails.Trade calldata t) external returns (uint256 amountOut) {
        Session storage s = sessions[msg.sender];
        if (!s.active) revert NoSession();
        if (block.timestamp >= s.expiry) revert SessionExpired();
        if (t.isBuy ? !s.buysAllowed : !s.sellsAllowed) revert SideNotAllowed();
        if (!tokenAllowed[msg.sender][t.stockToken]) revert TokenNotInSession();
        if (s.tradesUsed >= s.maxTrades) revert TradeCountExhausted();

        uint256 notional = vault.quoteNotional(t);
        if (notional > s.maxNotionalPerTrade) revert TradeTooLarge();
        if (s.cumNotionalUsed + notional > s.maxCumNotional) revert BudgetExhausted();

        // If the vault refuses, this whole call reverts and the counters below never move.
        amountOut = vault.executeTrade(t);
        s.tradesUsed += 1;
        s.cumNotionalUsed += notional;
        emit Executed(msg.sender, t.stockToken, t.isBuy, notional, amountOut);
    }
}
