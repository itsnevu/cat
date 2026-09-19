// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626, ERC20, IERC20, Math} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Guardrails} from "./Guardrails.sol";
import {GuardrailConfig} from "./GuardrailConfig.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";

/// @title RWAVault (vSPHYNX)
/// @notice ERC-4626 vault over USDG that holds tokenized stocks. Every order must pass the caps in
///         GuardrailConfig or the vault reverts it. Only the executor (a SessionKeyExecutor) can order;
///         depositors can always leave, in cash when the vault has it or in kind otherwise.
contract RWAVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 private constant BPS = 10_000;
    uint256 private constant TOKEN_TO_USDG = 1e30; // 18-dec token units x 18-dec price -> 6-dec USDG
    uint16 public constant MAX_EXIT_FEE_BPS = 100;
    uint8 public constant MAX_ALLOWLIST = 16;

    struct Position {
        uint256 costUsdg; // total USDG paid for the units currently held (average-cost basis)
        uint256 stopPriceE18; // the stop set on the most recent buy
    }

    struct Day {
        uint64 day; // block.timestamp / 1 days
        uint32 orders; // executed orders that day
        uint256 openNav; // NAV at the first order of the day
    }

    GuardrailConfig public guardrails;
    IPriceOracle public oracle;
    ISwapAdapter public adapter;
    address public executor;

    uint256 public depositCap;
    uint16 public exitFeeBps;

    address[] private _allowlist;
    mapping(address => bool) public isAllowed;
    mapping(address => Position) public positions;
    Day public today;

    event ExecutorSet(address executor);
    event OracleSet(address oracle);
    event AdapterSet(address adapter);
    event GuardrailsSet(address guardrails);
    event DepositCapSet(uint256 cap);
    event ExitFeeSet(uint16 bps);
    event AllowlistSet(address token, bool allowed);
    event TradeExecuted(
        address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 priceE18, uint256 navAfter
    );
    event RedeemedInKind(address indexed owner, address indexed receiver, uint256 shares, uint256 usdgOut);

    error NotExecutor();
    error AllowlistFull();
    error ExitFeeTooHigh();
    error ZeroAddress();
    error SlippageNotMet();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    constructor(
        IERC20 usdg,
        address owner_,
        GuardrailConfig guardrails_,
        IPriceOracle oracle_,
        ISwapAdapter adapter_,
        uint256 depositCap_
    ) ERC4626(usdg) ERC20("Sphynx Vault", "vSPHYNX") Ownable(owner_) {
        if (address(guardrails_) == address(0) || address(oracle_) == address(0)) revert ZeroAddress();
        guardrails = guardrails_;
        oracle = oracle_;
        adapter = adapter_;
        depositCap = depositCap_;
    }

    // ------------------------------ admin ------------------------------

    function setExecutor(address e) external onlyOwner {
        executor = e;
        emit ExecutorSet(e);
    }

    function setOracle(IPriceOracle o) external onlyOwner {
        if (address(o) == address(0)) revert ZeroAddress();
        oracle = o;
        emit OracleSet(address(o));
    }

    function setAdapter(ISwapAdapter a) external onlyOwner {
        adapter = a;
        emit AdapterSet(address(a));
    }

    function setGuardrails(GuardrailConfig g) external onlyOwner {
        if (address(g) == address(0)) revert ZeroAddress();
        guardrails = g;
        emit GuardrailsSet(address(g));
    }

    function setDepositCap(uint256 cap) external onlyOwner {
        depositCap = cap;
        emit DepositCapSet(cap);
    }

    function setExitFee(uint16 bps) external onlyOwner {
        if (bps > MAX_EXIT_FEE_BPS) revert ExitFeeTooHigh();
        exitFeeBps = bps;
        emit ExitFeeSet(bps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function setAllowed(address token, bool allowed) external onlyOwner {
        if (token == address(0) || token == asset()) revert ZeroAddress();
        if (allowed && !isAllowed[token]) {
            if (_allowlist.length >= MAX_ALLOWLIST) revert AllowlistFull();
            _allowlist.push(token);
        } else if (!allowed && isAllowed[token]) {
            uint256 n = _allowlist.length;
            for (uint256 i = 0; i < n; i++) {
                if (_allowlist[i] == token) {
                    _allowlist[i] = _allowlist[n - 1];
                    _allowlist.pop();
                    break;
                }
            }
        }
        isAllowed[token] = allowed;
        emit AllowlistSet(token, allowed);
    }

    function allowlist() external view returns (address[] memory) {
        return _allowlist;
    }

    // ------------------------------ accounting ------------------------------

    /// @dev Shares carry 6 extra decimals over USDG (12 total); the virtual offset defeats the inflation attack.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    function usdgBalance() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    /// @notice Value of one token position in USDG (6 dec).
    function positionValue(address token) public view returns (uint256) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal == 0) return 0;
        return bal.mulDiv(oracle.priceE18(token), TOKEN_TO_USDG);
    }

    /// @notice NAV in USDG (6 dec): cash on hand plus every allowlisted position at oracle price.
    function totalAssets() public view override returns (uint256 nav) {
        nav = usdgBalance();
        uint256 n = _allowlist.length;
        for (uint256 i = 0; i < n; i++) nav += positionValue(_allowlist[i]);
    }

    function navUsdg() external view returns (uint256) {
        return totalAssets();
    }

    function openPositions() public view returns (uint256 count) {
        uint256 n = _allowlist.length;
        for (uint256 i = 0; i < n; i++) {
            if (IERC20(_allowlist[i]).balanceOf(address(this)) != 0) count++;
        }
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) return 0;
        uint256 nav = totalAssets();
        return nav >= depositCap ? 0 : depositCap - nav;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        return _convertToShares(maxDeposit(receiver), Math.Rounding.Floor);
    }

    /// @dev Cash withdrawals are limited to USDG on hand; use redeemInKind for the rest.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(super.maxWithdraw(owner), usdgBalance());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(super.maxRedeem(owner), _convertToShares(usdgBalance(), Math.Rounding.Floor));
    }

    /// @notice Burn shares for a pro-rata slice of cash and every held token, minus the exit fee
    ///         (which stays in the vault for remaining holders). Always available, even when paused.
    function redeemInKind(uint256 shares, address receiver) external nonReentrant returns (uint256 usdgOut) {
        if (receiver == address(0)) revert ZeroAddress();
        uint256 supply = totalSupply();
        uint256 keep = BPS - exitFeeBps;
        _burn(msg.sender, shares);
        usdgOut = usdgBalance().mulDiv(shares * keep, supply * BPS);
        if (usdgOut != 0) IERC20(asset()).safeTransfer(receiver, usdgOut);
        uint256 n = _allowlist.length;
        for (uint256 i = 0; i < n; i++) {
            IERC20 t = IERC20(_allowlist[i]);
            uint256 bal = t.balanceOf(address(this));
            if (bal == 0) continue;
            uint256 out = bal.mulDiv(shares * keep, supply * BPS);
            if (out != 0) {
                // scale the cost basis down with the units that leave
                Position storage p = positions[address(t)];
                p.costUsdg -= p.costUsdg.mulDiv(out, bal);
                t.safeTransfer(receiver, out);
            }
        }
        emit RedeemedInKind(msg.sender, receiver, shares, usdgOut);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        whenNotPaused
    {
        super._deposit(caller, receiver, assets, shares);
    }

    // ------------------------------ the riddle ------------------------------

    /// @notice Which rule the order would break, or None. A view: nobody has to sign to find out.
    function previewTrade(Guardrails.Trade calldata t) external view returns (Guardrails.Violation) {
        return _check(t);
    }

    /// @notice Notional of an order in USDG (6 dec), used by the executor for session budgets.
    function quoteNotional(Guardrails.Trade calldata t) external view returns (uint256) {
        if (t.isBuy) return t.amountIn;
        return t.amountIn.mulDiv(oracle.priceE18(t.stockToken), TOKEN_TO_USDG);
    }

    function _check(Guardrails.Trade calldata t) internal view returns (Guardrails.Violation) {
        if (paused()) return Guardrails.Violation.Paused;
        if (t.amountIn == 0) return Guardrails.Violation.ZeroAmount;
        if (!isAllowed[t.stockToken]) return Guardrails.Violation.NotAllowed;
        uint256 nav = totalAssets();
        if (nav == 0) return Guardrails.Violation.Unfunded;

        Guardrails.Caps memory c = guardrails.caps();
        uint64 dayNow = uint64(block.timestamp / 1 days);
        uint32 ordersToday = today.day == dayNow ? today.orders : 0;
        if (ordersToday >= c.maxDailyOrders) return Guardrails.Violation.MaxDailyOrders;

        uint256 price = oracle.priceE18(t.stockToken);
        uint256 held = IERC20(t.stockToken).balanceOf(address(this));

        if (!t.isBuy) {
            if (held < t.amountIn) return Guardrails.Violation.InsufficientPosition;
            return Guardrails.Violation.None;
        }

        // buys
        if (today.day == dayNow && today.openNav != 0) {
            uint256 haltLine = today.openNav.mulDiv(BPS - c.dailyLossHaltBps, BPS);
            if (nav < haltLine) return Guardrails.Violation.DailyLossHalt;
        }
        if (t.stopPriceE18 == 0 || t.stopPriceE18 >= price) return Guardrails.Violation.MissingStop;
        if (t.stopPriceE18 < price.mulDiv(BPS - c.stopLossBps, BPS)) return Guardrails.Violation.MissingStop;
        if (t.amountIn > nav.mulDiv(c.perTradeBps, BPS)) return Guardrails.Violation.PerTradeCap;
        uint256 posValue = held.mulDiv(price, TOKEN_TO_USDG);
        if (posValue + t.amountIn > nav.mulDiv(c.maxConcentrationBps, BPS)) {
            return Guardrails.Violation.Concentration;
        }
        if (held == 0 && openPositions() >= c.maxOpenPositions) return Guardrails.Violation.MaxPositions;
        uint256 cash = usdgBalance();
        if (cash < t.amountIn || cash - t.amountIn < nav.mulDiv(c.cashBufferBps, BPS)) {
            return Guardrails.Violation.CashBuffer;
        }
        if (held != 0 && !t.leftSideException) {
            uint256 avgCostE18 = positions[t.stockToken].costUsdg.mulDiv(TOKEN_TO_USDG, held);
            if (price < avgCostE18) return Guardrails.Violation.NoAveragingIntoLoser;
        }
        return Guardrails.Violation.None;
    }

    // ------------------------------ execution ------------------------------

    /// @notice Execute an order. Reverts with the exact rule it would break; only the executor may call.
    function executeTrade(Guardrails.Trade calldata t)
        external
        onlyExecutor
        nonReentrant
        returns (uint256 amountOut)
    {
        Guardrails.Violation v = _check(t);
        if (v != Guardrails.Violation.None) revert Guardrails.GuardrailBreach(v);
        if (address(adapter) == address(0)) revert ZeroAddress();

        uint64 dayNow = uint64(block.timestamp / 1 days);
        // first order of a UTC day opens the day at the current NAV (orders == 0 also covers day 0)
        if (today.day != dayNow || today.orders == 0) today = Day({day: dayNow, orders: 0, openNav: totalAssets()});
        today.orders += 1;

        uint256 price = oracle.priceE18(t.stockToken);
        IERC20 usdg = IERC20(asset());
        IERC20 stock = IERC20(t.stockToken);
        Position storage p = positions[t.stockToken];

        if (t.isBuy) {
            usdg.forceApprove(address(adapter), t.amountIn);
            uint256 before = stock.balanceOf(address(this));
            adapter.swap(address(usdg), t.stockToken, t.amountIn, t.minAmountOut, address(this));
            amountOut = stock.balanceOf(address(this)) - before;
            if (amountOut < t.minAmountOut) revert SlippageNotMet();
            p.costUsdg += t.amountIn;
            p.stopPriceE18 = t.stopPriceE18;
        } else {
            uint256 heldBefore = stock.balanceOf(address(this));
            stock.forceApprove(address(adapter), t.amountIn);
            uint256 before = usdg.balanceOf(address(this));
            adapter.swap(t.stockToken, address(usdg), t.amountIn, t.minAmountOut, address(this));
            amountOut = usdg.balanceOf(address(this)) - before;
            if (amountOut < t.minAmountOut) revert SlippageNotMet();
            p.costUsdg -= p.costUsdg.mulDiv(t.amountIn, heldBefore);
            if (heldBefore == t.amountIn) p.stopPriceE18 = 0;
        }
        emit TradeExecuted(t.stockToken, t.isBuy, t.amountIn, amountOut, price, totalAssets());
    }
}
