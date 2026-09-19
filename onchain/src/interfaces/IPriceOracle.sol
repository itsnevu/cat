// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Prices a stock token in USDG. 18-decimal fixed point: USDG (as a 1e18 number) per 1e18 token units.
interface IPriceOracle {
    function priceE18(address stockToken) external view returns (uint256);
}
