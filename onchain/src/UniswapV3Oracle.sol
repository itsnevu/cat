// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";
import {TickMath} from "./libraries/TickMath.sol";

/// @title UniswapV3Oracle
/// @notice Time-weighted price of a stock token in USDG from its Uniswap V3 pool. A TWAP over `twapSeconds`
///         cannot be moved inside one block, and the spot check refuses a read when spot has run more than
///         `maxSpotDeviationBps` away from the average (the signature of a manipulation in progress).
contract UniswapV3Oracle is IPriceOracle, Ownable2Step {
    address public immutable usdg;
    uint32 public twapSeconds;
    uint16 public maxSpotDeviationBps;
    mapping(address => IUniswapV3Pool) public poolOf;

    event PoolSet(address indexed token, address pool);
    event ParamsSet(uint32 twapSeconds, uint16 maxSpotDeviationBps);

    error BadPool();
    error NoPool(address token);
    error SpotDeviates(address token);

    constructor(address owner_, address usdg_, uint32 twapSeconds_, uint16 maxSpotDeviationBps_) Ownable(owner_) {
        usdg = usdg_;
        twapSeconds = twapSeconds_;
        maxSpotDeviationBps = maxSpotDeviationBps_;
    }

    function setPool(address token, IUniswapV3Pool pool) external onlyOwner {
        address t0 = pool.token0();
        address t1 = pool.token1();
        if (!((t0 == usdg && t1 == token) || (t1 == usdg && t0 == token))) revert BadPool();
        poolOf[token] = pool;
        emit PoolSet(token, address(pool));
    }

    function setParams(uint32 twapSeconds_, uint16 maxSpotDeviationBps_) external onlyOwner {
        twapSeconds = twapSeconds_;
        maxSpotDeviationBps = maxSpotDeviationBps_;
        emit ParamsSet(twapSeconds_, maxSpotDeviationBps_);
    }

    /// @notice USDG per 1 token, 18-dec fixed point, from the TWAP.
    function priceE18(address token) external view returns (uint256) {
        IUniswapV3Pool pool = poolOf[token];
        if (address(pool) == address(0)) revert NoPool(token);
        bool usdgIs0 = pool.token0() == usdg;

        uint256 twap = _quote(_twapSqrt(pool), usdgIs0);
        (uint160 spotSqrt,,,,,,) = pool.slot0();
        uint256 spot = _quote(spotSqrt, usdgIs0);
        uint256 diff = spot > twap ? spot - twap : twap - spot;
        if (diff * 10_000 > twap * maxSpotDeviationBps) revert SpotDeviates(token);
        return twap;
    }

    /// @notice Spot price, for display only.
    function spotE18(address token) external view returns (uint256) {
        IUniswapV3Pool pool = poolOf[token];
        if (address(pool) == address(0)) revert NoPool(token);
        (uint160 spotSqrt,,,,,,) = pool.slot0();
        return _quote(spotSqrt, pool.token0() == usdg);
    }

    function _twapSqrt(IUniswapV3Pool pool) internal view returns (uint160) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = twapSeconds;
        ago[1] = 0;
        (int56[] memory cum,) = pool.observe(ago);
        int56 delta = cum[1] - cum[0];
        int24 avgTick = int24(delta / int56(uint56(twapSeconds)));
        // round toward negative infinity like the reference OracleLibrary
        if (delta < 0 && (delta % int56(uint56(twapSeconds)) != 0)) avgTick--;
        return TickMath.getSqrtRatioAtTick(avgTick);
    }

    /// @dev USDG units for 1e18 token units at this sqrt price, scaled to 18 decimals.
    function _quote(uint160 sqrtPriceX96, bool usdgIs0) internal pure returns (uint256) {
        uint256 base = 1e18; // one whole stock token
        uint256 usdgUnits;
        if (sqrtPriceX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPriceX96) * sqrtPriceX96;
            // token is token1 when usdg is token0: quote = base * 2^192 / ratio
            usdgUnits = usdgIs0 ? Math.mulDiv(1 << 192, base, ratioX192) : Math.mulDiv(ratioX192, base, 1 << 192);
        } else {
            uint256 ratioX128 = Math.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
            usdgUnits = usdgIs0 ? Math.mulDiv(1 << 128, base, ratioX128) : Math.mulDiv(ratioX128, base, 1 << 128);
        }
        return usdgUnits * 1e12;
    }
}
