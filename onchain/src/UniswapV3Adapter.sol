// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ISwapAdapter} from "./interfaces/ISwapAdapter.sol";
import {IUniswapV3Pool, IUniswapV3SwapCallback} from "./interfaces/IUniswapV3.sol";
import {TickMath} from "./libraries/TickMath.sol";

/// @title UniswapV3Adapter
/// @notice The vault's only execution surface: a typed swap straight against an owner-registered Uniswap V3
///         pool. No router, no arbitrary calldata; one pool per stock token, always paired with USDG.
contract UniswapV3Adapter is ISwapAdapter, IUniswapV3SwapCallback, Ownable2Step {
    using SafeERC20 for IERC20;

    address public immutable usdg;
    mapping(address => IUniswapV3Pool) public poolOf; // stock token => USDG/token pool

    // set for the duration of one swap so the callback can verify its caller
    address private _expectedPool;

    event PoolSet(address indexed token, address pool);

    error UnknownPair();
    error BadPool();
    error BadCallback();
    error SlippageNotMet();

    constructor(address owner_, address usdg_) Ownable(owner_) {
        usdg = usdg_;
    }

    function setPool(address token, IUniswapV3Pool pool) external onlyOwner {
        address t0 = pool.token0();
        address t1 = pool.token1();
        if (!((t0 == usdg && t1 == token) || (t1 == usdg && t0 == token))) revert BadPool();
        poolOf[token] = pool;
        emit PoolSet(token, address(pool));
    }

    function _pair(address tokenIn, address tokenOut) internal view returns (IUniswapV3Pool pool, bool zeroForOne) {
        address stock = tokenIn == usdg ? tokenOut : tokenIn;
        if (tokenIn != usdg && tokenOut != usdg) revert UnknownPair();
        pool = poolOf[stock];
        if (address(pool) == address(0)) revert UnknownPair();
        zeroForOne = pool.token0() == tokenIn;
    }

    /// @inheritdoc ISwapAdapter
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut)
    {
        (IUniswapV3Pool pool, bool zeroForOne) = _pair(tokenIn, tokenOut);
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        _expectedPool = address(pool);
        (int256 a0, int256 a1) = pool.swap(
            to,
            zeroForOne,
            int256(amountIn),
            zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1,
            abi.encode(tokenIn)
        );
        _expectedPool = address(0);
        amountOut = uint256(-(zeroForOne ? a1 : a0));
        if (amountOut < minAmountOut) revert SlippageNotMet();
    }

    /// @notice Simulate a swap and return the output. Not a view (it runs the pool), so call it with eth_call.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external returns (uint256 amountOut) {
        (IUniswapV3Pool pool, bool zeroForOne) = _pair(tokenIn, tokenOut);
        try pool.swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? TickMath.MIN_SQRT_RATIO + 1 : TickMath.MAX_SQRT_RATIO - 1,
            abi.encode(tokenIn, true)
        ) {} catch (bytes memory reason) {
            if (reason.length != 32) revert BadCallback();
            return abi.decode(reason, (uint256));
        }
    }

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (data.length == 64) {
            // quote path: report the output and unwind
            (, bool quoting) = abi.decode(data, (address, bool));
            if (quoting) {
                uint256 out = uint256(-(amount0Delta < 0 ? amount0Delta : amount1Delta));
                assembly {
                    mstore(0, out)
                    revert(0, 32)
                }
            }
        }
        if (msg.sender != _expectedPool) revert BadCallback();
        address tokenIn = abi.decode(data, (address));
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        IERC20(tokenIn).safeTransfer(msg.sender, owed);
    }
}
