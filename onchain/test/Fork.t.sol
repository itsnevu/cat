// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Guardrails} from "../src/Guardrails.sol";
import {GuardrailConfig} from "../src/GuardrailConfig.sol";
import {RWAVault} from "../src/RWAVault.sol";
import {SessionKeyExecutor} from "../src/SessionKeyExecutor.sol";
import {UniswapV3Adapter} from "../src/UniswapV3Adapter.sol";
import {UniswapV3Oracle} from "../src/UniswapV3Oracle.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";

/// @notice Runs only with FORK_RPC set: deploys the desk on a fork of Robinhood Chain mainnet and trades
///         NVDA through the real Uniswap V2 router with real USDG.
contract ForkTest is Test {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant NVDA_POOL = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3; // USDG/NVDA 0.05%

    address owner = makeAddr("owner");
    address agent = makeAddr("agent");
    address alice = makeAddr("alice");

    RWAVault vault;
    SessionKeyExecutor exec;
    UniswapV3Oracle oracle;
    UniswapV3Adapter adapter;

    function setUp() public {
        string memory rpc = vm.envOr("FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        GuardrailConfig cfg = new GuardrailConfig(
            owner, Guardrails.Caps(1500, 2500, 6, 4, 800, 500, 1000)
        );
        oracle = new UniswapV3Oracle(owner, USDG, 300, 300);
        adapter = new UniswapV3Adapter(owner, USDG);
        vault = new RWAVault(IERC20(USDG), owner, cfg, IPriceOracle(address(oracle)), adapter, 10_000e6);
        exec = new SessionKeyExecutor(owner, vault);

        vm.startPrank(owner);
        adapter.setPool(NVDA, IUniswapV3Pool(NVDA_POOL));
        oracle.setPool(NVDA, IUniswapV3Pool(NVDA_POOL));
        vault.setExecutor(address(exec));
        vault.setAllowed(NVDA, true);
        address[] memory toks = new address[](1);
        toks[0] = NVDA;
        exec.grant(agent, uint64(block.timestamp + 1 days), 1_500e6, 10, 5_000e6, true, true, toks);
        vm.stopPrank();

        deal(USDG, alice, 5_000e6);
    }

    function test_forkBuyAndSellNvdaThroughRealRouter() public {
        if (address(vault) == address(0)) return; // no FORK_RPC
        uint256 px = oracle.priceE18(NVDA);
        uint256 spot = oracle.spotE18(NVDA);
        console.log("NVDA TWAP (USDG, e18):", px);
        console.log("NVDA spot (USDG, e18):", spot);
        assertGt(px, 50e18);
        assertLt(px, 2_000e18);
        uint256 q = adapter.quote(USDG, NVDA, 100e6);
        console.log("quote: NVDA for 100 USDG:", q);
        assertGt(q, 0);

        vm.startPrank(alice);
        IERC20(USDG).approve(address(vault), 1_000e6);
        vault.deposit(1_000e6, alice);
        vm.stopPrank();
        assertEq(vault.totalAssets(), 1_000e6);

        Guardrails.Trade memory t = Guardrails.Trade({
            stockToken: NVDA, isBuy: true, amountIn: 100e6, minAmountOut: 0, stopPriceE18: px * 95 / 100, leftSideException: false
        });
        assertEq(uint256(vault.previewTrade(t)), uint256(Guardrails.Violation.None));
        t.minAmountOut = q * 99 / 100;
        vm.prank(agent);
        uint256 got = exec.execute(t);
        assertGe(got, t.minAmountOut);
        console.log("NVDA received for 100 USDG:", got);
        assertGt(got, 0);
        assertEq(IERC20(NVDA).balanceOf(address(vault)), got);
        uint256 nav = vault.totalAssets();
        console.log("NAV after buy:", nav);
        assertGt(nav, 950e6, "swap fees + spot within 5%");

        Guardrails.Trade memory s = Guardrails.Trade({
            stockToken: NVDA, isBuy: false, amountIn: got, minAmountOut: 0, stopPriceE18: 0, leftSideException: false
        });
        vm.prank(agent);
        uint256 back = exec.execute(s);
        console.log("USDG back from selling it all:", back);
        assertGt(back, 90e6);
        assertEq(IERC20(NVDA).balanceOf(address(vault)), 0);

        // refusal spends no budget: 500 USDG breaks the 15% per-trade cap
        t.amountIn = 500e6;
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Guardrails.GuardrailBreach.selector, Guardrails.Violation.PerTradeCap));
        exec.execute(t);
        (,,, , uint32 used,,,,) = exec.sessions(agent);
        assertEq(used, 2);
    }
}
