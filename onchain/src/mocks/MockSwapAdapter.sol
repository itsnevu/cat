// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISwapAdapter} from "../interfaces/ISwapAdapter.sol";
import {MockRouter} from "./MockRouter.sol";

/// @notice Test adapter: forwards to MockRouter, which mints the output at a fixed rate.
contract MockSwapAdapter is ISwapAdapter {
    using SafeERC20 for IERC20;

    MockRouter public immutable router;

    constructor(MockRouter r) {
        router = r;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory amounts = router.swapExactTokensForTokens(amountIn, minAmountOut, path, to, block.timestamp);
        amountOut = amounts[1];
    }
}
