// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guardrails} from "../src/Guardrails.sol";
import {GuardrailConfig} from "../src/GuardrailConfig.sol";
import {RWAVault} from "../src/RWAVault.sol";
import {SessionKeyExecutor} from "../src/SessionKeyExecutor.sol";
import {DeskRegistry} from "../src/DeskRegistry.sol";
import {MockSwapAdapter} from "../src/mocks/MockSwapAdapter.sol";
import {PostedPriceOracle} from "../src/PostedPriceOracle.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockRouter} from "../src/mocks/MockRouter.sol";

contract DeskTest is Test {
    address owner = makeAddr("safe");
    address agent = makeAddr("agent");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    MockERC20 usdg;
    MockERC20 nvda;
    MockERC20 aapl;
    MockRouter router;
    GuardrailConfig cfg;
    PostedPriceOracle oracle;
    MockSwapAdapter adapter;
    RWAVault vault;
    SessionKeyExecutor exec;
    DeskRegistry registry;

    uint256 constant USDG = 1e6;
    uint256 constant CAP = 10_000 * USDG;

    function setUp() public {
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        nvda = new MockERC20("NVIDIA Stock Token", "NVDA", 18);
        aapl = new MockERC20("Apple Stock Token", "AAPL", 18);
        router = new MockRouter();
        // 1 NVDA = 200 USDG; 1 AAPL = 100 USDG
        router.setRate(address(usdg), address(nvda), 5e15); // 1 USDG -> 0.005 NVDA
        router.setRate(address(nvda), address(usdg), 200 * USDG);
        router.setRate(address(usdg), address(aapl), 1e16);
        router.setRate(address(aapl), address(usdg), 100 * USDG);

        cfg = new GuardrailConfig(
            owner,
            Guardrails.Caps({
                perTradeBps: 1500,
                maxConcentrationBps: 2500,
                maxOpenPositions: 6,
                maxDailyOrders: 4,
                stopLossBps: 800,
                dailyLossHaltBps: 500,
                cashBufferBps: 1000
            })
        );
        oracle = new PostedPriceOracle(owner, 1 days);
        adapter = new MockSwapAdapter(router);
        vault = new RWAVault(usdg, owner, cfg, IPriceOracle(address(oracle)), adapter, CAP);
        exec = new SessionKeyExecutor(owner, vault);
        registry = new DeskRegistry();

        vm.startPrank(owner);
        oracle.post(address(nvda), 200e18);
        oracle.post(address(aapl), 100e18);
        vault.setExecutor(address(exec));
        vault.setAllowed(address(nvda), true);
        vault.setAllowed(address(aapl), true);
        address[] memory toks = new address[](2);
        toks[0] = address(nvda);
        toks[1] = address(aapl);
        exec.grant(agent, uint64(block.timestamp + 1 days), 2_000 * USDG, 10, 5_000 * USDG, true, true, toks);
        vm.stopPrank();

        usdg.mint(alice, 100_000 * USDG);
        usdg.mint(bob, 100_000 * USDG);
    }

    function _deposit(address who, uint256 amt) internal returns (uint256 shares) {
        vm.startPrank(who);
        usdg.approve(address(vault), amt);
        shares = vault.deposit(amt, who);
        vm.stopPrank();
    }

    function _buy(address tok, uint256 amount, uint256 stop) internal pure returns (Guardrails.Trade memory) {
        return Guardrails.Trade({
            stockToken: tok, isBuy: true, amountIn: amount, minAmountOut: 0, stopPriceE18: stop, leftSideException: false
        });
    }

    function _sell(address tok, uint256 units) internal pure returns (Guardrails.Trade memory) {
        return Guardrails.Trade({
            stockToken: tok, isBuy: false, amountIn: units, minAmountOut: 0, stopPriceE18: 0, leftSideException: false
        });
    }

    // ------------------------------ deposits ------------------------------

    function test_depositMintsSharesAndRespectsCap() public {
        uint256 shares = _deposit(alice, 1_000 * USDG);
        assertEq(shares, 1_000 * USDG * 1e6, "12-dec shares");
        assertEq(vault.totalAssets(), 1_000 * USDG);
        assertEq(vault.maxDeposit(bob), 9_000 * USDG);
        vm.startPrank(bob);
        usdg.approve(address(vault), 20_000 * USDG);
        vm.expectRevert();
        vault.deposit(9_001 * USDG, bob);
        vm.stopPrank();
    }

    function test_depositBlockedWhenPaused() public {
        vm.prank(owner);
        vault.pause();
        assertEq(vault.maxDeposit(alice), 0);
        vm.startPrank(alice);
        usdg.approve(address(vault), 1 * USDG);
        vm.expectRevert();
        vault.deposit(1 * USDG, alice);
        vm.stopPrank();
    }

    // ------------------------------ previewTrade: every refusal ------------------------------

    function test_previewUnfunded() public view {
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 100 * USDG, 190e18))), uint256(Guardrails.Violation.Unfunded));
    }

    function test_previewNotAllowed() public {
        _deposit(alice, 1_000 * USDG);
        MockERC20 rogue = new MockERC20("Rogue", "RGE", 18);
        assertEq(uint256(vault.previewTrade(_buy(address(rogue), 100 * USDG, 1e18))), uint256(Guardrails.Violation.NotAllowed));
    }

    function test_previewZeroAmount() public {
        _deposit(alice, 1_000 * USDG);
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 0, 190e18))), uint256(Guardrails.Violation.ZeroAmount));
    }

    function test_previewMissingStop() public {
        _deposit(alice, 1_000 * USDG);
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 100 * USDG, 0))), uint256(Guardrails.Violation.MissingStop));
        // stop above price
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 100 * USDG, 201e18))), uint256(Guardrails.Violation.MissingStop));
        // stop too deep: 8% cap, 20% below is refused
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 100 * USDG, 160e18))), uint256(Guardrails.Violation.MissingStop));
        // 5% below passes
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 100 * USDG, 190e18))), uint256(Guardrails.Violation.None));
    }

    function test_previewPerTradeCap() public {
        _deposit(alice, 1_000 * USDG);
        // 15% of 1000 = 150
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 151 * USDG, 190e18))), uint256(Guardrails.Violation.PerTradeCap));
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 150 * USDG, 190e18))), uint256(Guardrails.Violation.None));
    }

    function test_previewConcentration() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 150 * USDG, 190e18));
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 100 * USDG, 190e18)); // 250 = 25%, at the line
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 10 * USDG, 190e18))), uint256(Guardrails.Violation.Concentration));
    }

    function test_previewMaxDailyOrders() public {
        _deposit(alice, 10_000 * USDG);
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(agent);
            exec.execute(_buy(i % 2 == 0 ? address(nvda) : address(aapl), 100 * USDG, i % 2 == 0 ? 190e18 : 95e18));
        }
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 10 * USDG, 190e18))), uint256(Guardrails.Violation.MaxDailyOrders));
        vm.warp(block.timestamp + 1 days);
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 10 * USDG, 190e18))), uint256(Guardrails.Violation.None));
    }

    function test_previewCashBuffer() public {
        _deposit(alice, 1_000 * USDG);
        vm.startPrank(owner);
        cfg.setCaps(5000, 5000, 6, 10, 800, 500, 1000); // widen so only the cash buffer binds
        vm.stopPrank();
        // nav 1000, buy 450 -> cash 550 ok; second buy 450 -> cash 100 = 10% buffer exactly, third 10 breaks it
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 450 * USDG, 190e18));
        vm.prank(agent);
        exec.execute(_buy(address(aapl), 450 * USDG, 95e18));
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 10 * USDG, 190e18))), uint256(Guardrails.Violation.CashBuffer));
    }

    function test_previewNoAveragingIntoLoser() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 100 * USDG, 190e18));
        vm.prank(owner);
        oracle.post(address(nvda), 180e18); // price falls below avg cost 200
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 50 * USDG, 170e18))), uint256(Guardrails.Violation.NoAveragingIntoLoser));
        Guardrails.Trade memory t = _buy(address(nvda), 50 * USDG, 170e18);
        t.leftSideException = true;
        assertEq(uint256(vault.previewTrade(t)), uint256(Guardrails.Violation.None));
    }

    function test_previewDailyLossHalt() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 150 * USDG, 190e18)); // opens the day at NAV 1000
        vm.prank(owner);
        oracle.post(address(nvda), 100e18); // position 150 -> 75, NAV 925 = -7.5% > 5% halt
        assertEq(uint256(vault.previewTrade(_buy(address(aapl), 50 * USDG, 95e18))), uint256(Guardrails.Violation.DailyLossHalt));
        // sells are still allowed during a halt
        assertEq(uint256(vault.previewTrade(_sell(address(nvda), 1e17))), uint256(Guardrails.Violation.None));
    }

    function test_previewInsufficientPosition() public {
        _deposit(alice, 1_000 * USDG);
        assertEq(uint256(vault.previewTrade(_sell(address(nvda), 1e18))), uint256(Guardrails.Violation.InsufficientPosition));
    }

    function test_previewPaused() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(owner);
        vault.pause();
        assertEq(uint256(vault.previewTrade(_buy(address(nvda), 100 * USDG, 190e18))), uint256(Guardrails.Violation.Paused));
    }

    function test_previewMaxPositions() public {
        vm.prank(owner);
        cfg.setCaps(1500, 2500, 1, 10, 800, 500, 1000); // one position max
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 100 * USDG, 190e18));
        assertEq(uint256(vault.previewTrade(_buy(address(aapl), 50 * USDG, 95e18))), uint256(Guardrails.Violation.MaxPositions));
    }

    // ------------------------------ execution ------------------------------

    function test_buyThenSellMovesTokensAndNav() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        uint256 got = exec.execute(_buy(address(nvda), 100 * USDG, 190e18));
        assertEq(got, 5e17, "0.5 NVDA for 100 USDG");
        assertEq(nvda.balanceOf(address(vault)), 5e17);
        assertEq(vault.usdgBalance(), 900 * USDG);
        assertEq(vault.totalAssets(), 1_000 * USDG, "NAV unchanged at oracle price");
        (uint256 cost,) = vault.positions(address(nvda));
        assertEq(cost, 100 * USDG);

        vm.prank(agent);
        uint256 usdgBack = exec.execute(_sell(address(nvda), 5e17));
        assertEq(usdgBack, 100 * USDG);
        assertEq(nvda.balanceOf(address(vault)), 0);
        (cost,) = vault.positions(address(nvda));
        assertEq(cost, 0);
    }

    function test_vaultRevertsWithExactViolationAndSpendsNoBudget() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Guardrails.GuardrailBreach.selector, Guardrails.Violation.PerTradeCap));
        exec.execute(_buy(address(nvda), 500 * USDG, 190e18));
        (,,, , uint32 used,, uint256 cum,,) = exec.sessions(agent);
        assertEq(used, 0);
        assertEq(cum, 0);
    }

    function test_onlyExecutorCanTrade() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        vm.expectRevert(RWAVault.NotExecutor.selector);
        vault.executeTrade(_buy(address(nvda), 100 * USDG, 190e18));
    }

    function test_slippageFloorEnforced() public {
        _deposit(alice, 1_000 * USDG);
        Guardrails.Trade memory t = _buy(address(nvda), 100 * USDG, 190e18);
        t.minAmountOut = 6e17; // wants 0.6, market gives 0.5
        vm.prank(agent);
        vm.expectRevert();
        exec.execute(t);
    }

    // ------------------------------ sessions ------------------------------

    function test_sessionScoping() public {
        _deposit(alice, 10_000 * USDG);
        vm.prank(owner);
        exec.grant(agent, uint64(block.timestamp + 1 days), 100 * USDG, 2, 150 * USDG, true, false, _two());
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.TradeTooLarge.selector);
        exec.execute(_buy(address(nvda), 101 * USDG, 190e18));
        // side
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.SideNotAllowed.selector);
        exec.execute(_sell(address(nvda), 1));
        // budget: 100 ok, then 60 breaks 150 cum
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 100 * USDG, 190e18));
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.BudgetExhausted.selector);
        exec.execute(_buy(address(aapl), 60 * USDG, 95e18));
        // count: 40 ok (2nd), then 3rd refused
        vm.prank(agent);
        exec.execute(_buy(address(aapl), 40 * USDG, 95e18));
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.TradeCountExhausted.selector);
        exec.execute(_buy(address(aapl), 1 * USDG, 95e18));
    }

    function test_sessionExpiryAndRevoke() public {
        _deposit(alice, 1_000 * USDG);
        vm.warp(block.timestamp + 2 days);
        vm.prank(owner);
        oracle.post(address(nvda), 200e18);
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.SessionExpired.selector);
        exec.execute(_buy(address(nvda), 10 * USDG, 190e18));
        vm.prank(owner);
        exec.grant(agent, uint64(block.timestamp + 1 days), 100 * USDG, 2, 150 * USDG, true, true, _two());
        vm.prank(owner);
        exec.revoke(agent);
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.NoSession.selector);
        exec.execute(_buy(address(nvda), 10 * USDG, 190e18));
    }

    function test_strangerHasNoSession() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(bob);
        vm.expectRevert(SessionKeyExecutor.NoSession.selector);
        exec.execute(_buy(address(nvda), 10 * USDG, 190e18));
    }

    function test_tokenNotInSession() public {
        _deposit(alice, 1_000 * USDG);
        MockERC20 tsla = new MockERC20("Tesla", "TSLA", 18);
        vm.prank(owner);
        vault.setAllowed(address(tsla), true);
        vm.prank(owner);
        oracle.post(address(tsla), 50e18);
        vm.prank(agent);
        vm.expectRevert(SessionKeyExecutor.TokenNotInSession.selector);
        exec.execute(_buy(address(tsla), 10 * USDG, 48e18));
    }

    // ------------------------------ exits ------------------------------

    function test_cashWithdrawLimitedToUsdgOnHand() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 150 * USDG, 190e18));
        assertEq(vault.maxWithdraw(alice), 850 * USDG);
        vm.prank(alice);
        vault.withdraw(850 * USDG, alice, alice);
        assertEq(usdg.balanceOf(alice), 100_000 * USDG - 150 * USDG);
    }

    function test_redeemInKindProRataWithExitFee() public {
        _deposit(alice, 1_000 * USDG);
        _deposit(bob, 1_000 * USDG);
        vm.prank(owner);
        vault.setExitFee(100); // 1%
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 200 * USDG, 190e18)); // vault: 1800 USDG + 1 NVDA
        uint256 aliceShares = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 usdgOut = vault.redeemInKind(aliceShares, alice);
        // half of 1800 = 900, minus 1% = 891; half of 1 NVDA = 0.5, minus 1% = 0.495
        assertEq(usdgOut, 891 * USDG);
        assertEq(nvda.balanceOf(alice), 495e15);
        assertEq(vault.balanceOf(alice), 0);
        // bob now owns everything left, worth more than his share was
        assertEq(vault.totalAssets(), 909 * USDG + 505e15 * 200 / 1e18 * USDG);
        (uint256 cost,) = vault.positions(address(nvda));
        assertEq(cost, 101 * USDG, "cost basis scales with units that left");
    }

    function test_redeemInKindWorksWhilePaused() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(owner);
        vault.pause();
        uint256 s = vault.balanceOf(alice);
        vm.prank(alice);
        uint256 out = vault.redeemInKind(s, alice);
        assertEq(out, 1_000 * USDG);
    }

    // ------------------------------ config + registry ------------------------------

    function test_capsCannotExceedCeilings() public {
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(GuardrailConfig.CapOutOfRange.selector, "perTradeBps"));
        cfg.setCaps(5001, 2500, 6, 4, 800, 500, 1000);
        vm.expectRevert(abi.encodeWithSelector(GuardrailConfig.CapOutOfRange.selector, "stopLossBps"));
        cfg.setCaps(1500, 2500, 6, 4, 2501, 500, 1000);
        vm.expectRevert(abi.encodeWithSelector(GuardrailConfig.CapOutOfRange.selector, "cashBufferBps"));
        cfg.setCaps(1500, 2500, 6, 4, 800, 500, 100);
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert();
        cfg.setCaps(1500, 2500, 6, 4, 800, 500, 1000);
    }

    function test_stalePriceRefusesEverything() public {
        _deposit(alice, 1_000 * USDG);
        vm.prank(agent);
        exec.execute(_buy(address(nvda), 100 * USDG, 190e18));
        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.StalePrice.selector, address(nvda)));
        vault.totalAssets();
        vm.expectRevert(abi.encodeWithSelector(PostedPriceOracle.StalePrice.selector, address(nvda)));
        vault.previewTrade(_buy(address(nvda), 10 * USDG, 190e18));
    }

    function test_registryAppendOnly() public {
        bytes32 salt = keccak256("sphynx-desk");
        bytes32 subject = registry.subjectFor(address(this), salt);
        uint256 i0 = registry.attest(salt, 1, 1_000 * USDG, 0, keccak256("s1"), "ipfs://one");
        uint256 i1 = registry.attest(salt, 2, 1_010 * USDG, 10 * int256(USDG), keccak256("s2"), "ipfs://two");
        assertEq(i0, 0);
        assertEq(i1, 1);
        assertEq(registry.count(subject), 2);
        DeskRegistry.Attestation memory a = registry.at(subject, 1);
        assertEq(a.epoch, 2);
        assertEq(a.realizedPnl, 10 * int256(USDG));
        assertEq(a.uri, "ipfs://two");
        // a stranger cannot write to my subject
        vm.prank(bob);
        vm.expectRevert(DeskRegistry.NotAuthorized.selector);
        registry.attestAs(subject, 3, 0, 0, 0, "");
        // but a delegated attester can
        registry.setAttester(salt, bob);
        vm.prank(bob);
        registry.attestAs(subject, 3, 0, 0, 0, "veto");
        assertEq(registry.count(subject), 3);
    }

    function _two() internal view returns (address[] memory t) {
        t = new address[](2);
        t[0] = address(nvda);
        t[1] = address(aapl);
    }
}
