// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A narrow, typed execution surface. The vault approves `amountIn` of `tokenIn` to the adapter,
///         calls `swap`, and expects at least `minAmountOut` of `tokenOut` delivered to `to`.
interface ISwapAdapter {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut);
}
