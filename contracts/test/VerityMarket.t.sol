// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VerityMarket} from "../src/VerityMarket.sol";
import {StandingBids} from "../src/StandingBids.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

contract VerityMarketTest is Test {
    MockUSDC usdc;
    VerityMarket market;
    StandingBids bids;

    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    address buyer2 = makeAddr("buyer2");
    address proposer = makeAddr("proposer");
    address disputer = makeAddr("disputer");
    address pool = makeAddr("pool");
    address oracle = makeAddr("oracle");

    bytes32 constant FEDREG = "FEDREG";
    uint64 constant WINDOW = 120;
    uint128 constant PBOND = 1e6;
    uint128 constant UP = 180_000; // $0.18
    uint128 constant CONT = 1_600_000; // $1.60
    uint128 constant BOND = 4_200_000; // $4.20

    function setUp() public {
        usdc = new MockUSDC();
        market = new VerityMarket(usdc, pool, WINDOW, PBOND);
        bids = new StandingBids(market);
        market.setResolver(FEDREG, true);
        market.setOracle(oracle, true);
        address[5] memory who = [seller, buyer, buyer2, proposer, disputer];
        for (uint256 i; i < who.length; i++) {
            usdc.mint(who[i], 100e6);
            vm.startPrank(who[i]);
            usdc.approve(address(market), type(uint256).max);
            usdc.approve(address(bids), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _commit(uint64 deadlineIn, uint64 exclusivity) internal returns (uint256 id) {
        VerityMarket.CommitParams memory p = VerityMarket.CommitParams({
            claimHash: keccak256("claim"),
            payloadHash: keccak256("payload"),
            resolverId: FEDREG,
            deadline: uint64(block.timestamp) + deadlineIn,
            exclusivitySeconds: exclusivity,
            upfront: UP,
            contingent: CONT,
            bond: BOND,
            confidenceBps: 8000,
            domain: "fedreg:hhs",
            attestation: market.ATTESTATION(),
            payloadURI: "ipfs://x",
            bloom: hex"00ff"
        });
        vm.prank(seller);
        id = market.commit(p);
    }

    function _proposeAndSettle(uint256 id, VerityMarket.Outcome o) internal {
        vm.prank(proposer);
        market.propose(id, o, "evidence");
        vm.warp(block.timestamp + WINDOW);
        market.settle(id);
    }

    function test_commitPullsBondAndRejectsUnlistedResolver() public {
        uint256 before = usdc.balanceOf(seller);
        _commit(1 days, 2 days);
        assertEq(before - usdc.balanceOf(seller), BOND);

        VerityMarket.CommitParams memory p;
        p.resolverId = "BUYER_BLOG"; // hard rule 3: buyer-controlled resolution is not whitelisted
        p.deadline = uint64(block.timestamp + 1 days);
        p.exclusivitySeconds = 1;
        p.upfront = 1;
        p.bond = 1;
        p.attestation = market.ATTESTATION();
        vm.prank(seller);
        vm.expectRevert(VerityMarket.NotWhitelisted.selector);
        market.commit(p);
    }

    function test_purchaseEscrowsBothTranches() public {
        uint256 id = _commit(1 days, 2 days);
        uint256 s0 = usdc.balanceOf(seller);
        vm.prank(buyer);
        market.purchase(id);
        assertEq(usdc.balanceOf(seller) - s0, UP);
        assertEq(usdc.balanceOf(address(market)), BOND + CONT);
        assertTrue(market.canDecrypt(id, buyer));
        assertFalse(market.canDecrypt(id, buyer2));
    }

    function test_exclusivityExpiryOpensKeyToEveryone() public {
        uint256 id = _commit(3 days, 1 hours);
        assertFalse(market.canDecrypt(id, buyer2));
        vm.warp(block.timestamp + 1 hours);
        assertTrue(market.canDecrypt(id, buyer2));
        assertTrue(market.isPublic(id));
    }

    function test_decayCurve() public {
        uint256 t0 = block.timestamp;
        uint256 id = _commit(3 days, 100);
        assertEq(market.currentUpfront(id), UP);
        vm.warp(t0 + 50);
        assertEq(market.currentUpfront(id), UP - UP / 4);
        vm.warp(t0 + 100);
        assertEq(market.currentUpfront(id), UP / 2);
    }

    // Outcome 1: true and public by deadline -> contingent to seller, bond returned.
    function test_settle_truePublic() public {
        uint256 id = _commit(1 days, 2 days);
        vm.prank(buyer);
        market.purchase(id);
        vm.prank(oracle);
        market.markPublished(id, "fr://2026-1");
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE);
        assertEq(usdc.balanceOf(seller) - s0, CONT + BOND);
        assertEq(usdc.balanceOf(pool), 0);
        assertEq(usdc.balanceOf(proposer), 100e6);
    }

    // Auto-release before the deadline counts as publication.
    function test_settle_trueAutoReleased() public {
        uint256 id = _commit(2 days, 1 days);
        vm.prank(buyer);
        market.purchase(id);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE);
        assertEq(usdc.balanceOf(seller) - s0, CONT + BOND);
    }

    // Outcome 2: true, not public by deadline -> contingent to pool, not the buyer. Suppression never pays.
    function test_settle_trueSuppressed() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        uint256 b0 = usdc.balanceOf(buyer);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE);
        assertEq(usdc.balanceOf(pool), CONT);
        assertEq(usdc.balanceOf(buyer), b0);
        assertEq(usdc.balanceOf(seller) - s0, BOND);
    }

    // Outcome 3: false -> contingent refunded, 50% of bond slashed, half to buyers and half to pool.
    function test_settle_falseHalfSlash() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        vm.prank(buyer2);
        market.purchase(id);
        uint256 b0 = usdc.balanceOf(buyer);
        uint256 s0 = usdc.balanceOf(seller);
        vm.prank(proposer);
        vm.expectRevert(VerityMarket.TooEarly.selector);
        market.propose(id, VerityMarket.Outcome.FALSE, "x");
        vm.warp(block.timestamp + 1 days);
        _proposeAndSettle(id, VerityMarket.Outcome.FALSE);
        uint128 slashed = BOND / 2;
        uint128 each = (slashed / 2) / 2;
        assertEq(usdc.balanceOf(buyer) - b0, CONT + each);
        assertEq(usdc.balanceOf(seller) - s0, BOND - slashed);
        assertEq(usdc.balanceOf(pool), slashed - each * 2);
        assertEq(usdc.balanceOf(address(market)), 0);
    }

    // Outcome 4: fabricated -> contingent refunded, 100% slash: buyer made whole on upfront, remainder to pool.
    function test_settle_fabricatedFullSlash() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        uint256 b0 = usdc.balanceOf(buyer);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.FABRICATED);
        assertEq(usdc.balanceOf(buyer) - b0, CONT + UP);
        assertEq(usdc.balanceOf(seller), s0);
        assertEq(usdc.balanceOf(pool), BOND - UP);
        VerityMarket.SellerRecord memory r = market.getSellerRecord(seller);
        assertEq(r.fabricated, 1);
        assertEq(r.bondsSlashed, BOND);
    }

    // Outcome 5: dispute -> owner backstop; disputer wins both proposer bonds.
    function test_dispute_ownerBackstop() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, "x");
        vm.prank(disputer);
        market.dispute(id);
        vm.expectRevert(VerityMarket.WrongStatus.selector);
        market.settle(id);
        uint256 d0 = usdc.balanceOf(disputer);
        market.resolveDispute(id, VerityMarket.Outcome.FABRICATED);
        assertEq(usdc.balanceOf(disputer) - d0, 2 * PBOND);
        assertEq(uint8(market.getClaim(id).outcome), uint8(VerityMarket.Outcome.FABRICATED));
    }

    function test_cannotDisputeAfterWindow() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, "x");
        vm.warp(block.timestamp + WINDOW);
        vm.prank(disputer);
        vm.expectRevert(VerityMarket.TooLate.selector);
        market.dispute(id);
    }

    function test_noPurchaseAfterExclusivity() public {
        uint256 id = _commit(3 days, 1 hours);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(buyer);
        vm.expectRevert(VerityMarket.TooLate.selector);
        market.purchase(id);
    }

    function test_standingBid_fillAndCancel() public {
        vm.prank(buyer);
        uint256 bidId = bids.postBid("fedreg:hhs", FEDREG, "any HHS contracting claim", 5e6, 2000, uint64(block.timestamp + 7 days));
        uint256 id = _commit(1 days, 5 days);
        uint256 b0 = usdc.balanceOf(buyer);
        vm.prank(seller);
        bids.fillBid(bidId, id);
        assertTrue(market.purchased(id, buyer));
        assertEq(usdc.balanceOf(buyer) - b0, 5e6 - (UP + CONT));

        vm.prank(buyer2);
        uint256 bid2 = bids.postBid("x", 0, "any", 1e6, 0, uint64(block.timestamp + 1 days));
        vm.prank(buyer);
        vm.expectRevert(StandingBids.Unauthorized.selector);
        bids.cancelBid(bid2);
        uint256 c0 = usdc.balanceOf(buyer2);
        vm.prank(buyer2);
        bids.cancelBid(bid2);
        assertEq(usdc.balanceOf(buyer2) - c0, 1e6);
    }
}
