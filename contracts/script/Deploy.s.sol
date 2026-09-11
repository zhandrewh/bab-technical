// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {VerityMarket} from "../src/VerityMarket.sol";
import {StandingBids} from "../src/StandingBids.sol";

contract Deploy is Script {
    // Circle USDC on Base Sepolia
    address constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        address oracle = vm.envAddress("ORACLE_ADDR");
        address pool = vm.envOr("POOL_ADDR", address(0x000000000000000000000000000000000000900d));
        uint64 window = uint64(vm.envOr("CHALLENGE_WINDOW", uint256(120)));
        uint128 pbond = uint128(vm.envOr("PROPOSER_BOND", uint256(500_000)));

        vm.startBroadcast(vm.envUint("DEPLOYER_PK"));
        VerityMarket market = new VerityMarket(IERC20(USDC), pool, window, pbond);
        StandingBids bids = new StandingBids(market);
        market.setResolver("FEDREG", true);
        market.setResolver("SAM", true);
        market.setResolver("COURTLISTENER", true);
        market.setOracle(oracle, true);
        vm.stopBroadcast();

        console.log("VerityMarket", address(market));
        console.log("StandingBids", address(bids));
    }
}
