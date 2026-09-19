// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Guardrails} from "../src/Guardrails.sol";
import {GuardrailConfig} from "../src/GuardrailConfig.sol";
import {RWAVault} from "../src/RWAVault.sol";
import {SessionKeyExecutor} from "../src/SessionKeyExecutor.sol";
import {DeskRegistry} from "../src/DeskRegistry.sol";
import {UniswapV3Adapter} from "../src/UniswapV3Adapter.sol";
import {UniswapV3Oracle} from "../src/UniswapV3Oracle.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {IUniswapV3Pool} from "../src/interfaces/IUniswapV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Deploys the SPHYNX desk against the real periphery on Robinhood Chain (chainId 4663).
///
///   OWNER            the Safe (or deployer for a dry run); receives ownership of everything
///   AGENT            the desk's session key holder; gets a scoped session
///   DEPOSIT_CAP_USDG cap in whole USDG (default 10000)
///
/// Real periphery, verified by direct call on 2026-09-20 (Uniswap V3 factory 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA):
///   USDG  0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168  (6 dec, "Global Dollar")
///   NVDA  0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC  pool 0xd4EB...14a3 (0.05%, ~3.7M USDG)
///   AAPL  0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9  pool 0xAae0...2d6D (0.05%, ~356k USDG)
///   SPY   0x117cc2133c37B721F49dE2A7a74833232B3B4C0C  pool 0xa7Bb...9167 (0.05%, ~496k USDG)
contract Deploy is Script {
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address constant SPY = 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C;
    address constant NVDA_POOL = 0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3;
    address constant AAPL_POOL = 0xAae0d815EE56e4092a5E5C2911E676Fea50B2d6D;
    address constant SPY_POOL = 0xa7Bb1AC63BBaB0C44316E6c8C455213441689167;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("OWNER", deployer);
        address agent = vm.envOr("AGENT", deployer);
        uint256 cap = vm.envOr("DEPOSIT_CAP_USDG", uint256(10_000)) * 1e6;

        require(block.chainid == 4663, "run on Robinhood Chain");
        require(IERC20Metadata(USDG).decimals() == 6, "USDG impostor");
        require(IUniswapV3Pool(NVDA_POOL).token1() == NVDA, "NVDA pool impostor");

        vm.startBroadcast(pk);

        GuardrailConfig cfg = new GuardrailConfig(
            deployer,
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
        // 5-minute TWAP; refuse a read when spot is more than 3% off the average
        UniswapV3Oracle oracle = new UniswapV3Oracle(deployer, USDG, 300, 300);
        UniswapV3Adapter adapter = new UniswapV3Adapter(deployer, USDG);
        RWAVault vault = new RWAVault(IERC20(USDG), deployer, cfg, IPriceOracle(address(oracle)), adapter, cap);
        SessionKeyExecutor exec = new SessionKeyExecutor(deployer, vault);
        DeskRegistry registry = new DeskRegistry();

        adapter.setPool(NVDA, IUniswapV3Pool(NVDA_POOL));
        adapter.setPool(AAPL, IUniswapV3Pool(AAPL_POOL));
        adapter.setPool(SPY, IUniswapV3Pool(SPY_POOL));
        oracle.setPool(NVDA, IUniswapV3Pool(NVDA_POOL));
        oracle.setPool(AAPL, IUniswapV3Pool(AAPL_POOL));
        oracle.setPool(SPY, IUniswapV3Pool(SPY_POOL));

        vault.setExecutor(address(exec));
        vault.setAllowed(NVDA, true);
        vault.setAllowed(AAPL, true);
        vault.setAllowed(SPY, true);

        address[] memory toks = new address[](3);
        toks[0] = NVDA; toks[1] = AAPL; toks[2] = SPY;
        exec.grant(agent, uint64(block.timestamp + 30 days), 1_500 * 1e6, 40, 20_000 * 1e6, true, true, toks);

        // seed the registry subject for this vault so the site can count refusals from day one
        bytes32 salt = keccak256(abi.encodePacked("sphynx-vault:", address(vault)));
        registry.attest(salt, 0, 0, 0, keccak256("genesis"), "sphynx:genesis");

        if (owner != deployer) {
            cfg.transferOwnership(owner);
            oracle.transferOwnership(owner);
            adapter.transferOwnership(owner);
            vault.transferOwnership(owner);
            exec.transferOwnership(owner);
        }
        vm.stopBroadcast();

        bytes32 subject = registry.subjectFor(deployer, salt);
        string memory a = string.concat(
            '{"chainId":4663,"deployer":"', vm.toString(deployer), '","owner":"', vm.toString(owner),
            '","agent":"', vm.toString(agent), '","guardrailConfig":"', vm.toString(address(cfg))
        );
        string memory b = string.concat(
            '","oracle":"', vm.toString(address(oracle)), '","adapter":"', vm.toString(address(adapter)),
            '","vault":"', vm.toString(address(vault)), '","executor":"', vm.toString(address(exec))
        );
        string memory c = string.concat(
            '","deskRegistry":"', vm.toString(address(registry)), '","registrySubject":"', vm.toString(subject),
            '","usdg":"', vm.toString(USDG), '","nvda":"', vm.toString(NVDA)
        );
        string memory d = string.concat(
            '","aapl":"', vm.toString(AAPL), '","spy":"', vm.toString(SPY), '","block":', vm.toString(block.number), "}"
        );
        string memory json = string.concat(a, b, c, d);
        vm.writeFile("deployments/latest.json", json);
        console.log(json);
    }
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
