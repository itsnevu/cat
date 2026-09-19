// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice A V2-shaped router with owner-set rates. Output tokens are minted and inputs are kept, so a
///         testnet vault can trade without anyone seeding pools.
contract MockRouter {
    using SafeERC20 for IERC20;

    // rateE18[tokenIn][tokenOut]: units of tokenOut (in its own decimals) per 1 whole tokenIn, 18-dec fixed
    mapping(address => mapping(address => uint256)) public rateE18;

    function factory() external view returns (address) {
        return address(this);
    }

    function WETH() external view returns (address) {
        return address(this);
    }

    function setRate(address tokenIn, address tokenOut, uint256 r) external {
        rateE18[tokenIn][tokenOut] = r;
    }

    function _out(address a, address b, uint256 amountIn) internal view returns (uint256) {
        uint256 r = rateE18[a][b];
        require(r != 0, "no rate");
        return amountIn * r / (10 ** MockERC20(a).decimals());
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) amounts[i] = _out(path[i - 1], path[i], amounts[i - 1]);
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 1; i < path.length; i++) amounts[i] = _out(path[i - 1], path[i], amounts[i - 1]);
        require(amounts[path.length - 1] >= amountOutMin, "slippage");
        IERC20(path[0]).safeTransferFrom(msg.sender, address(this), amountIn);
        MockERC20(path[path.length - 1]).mint(to, amounts[path.length - 1]);
    }
}
