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

    bytes32 constant DOJ = "DOJ_FCA";
    bytes32 constant REPLAY = "DOJ_FCA_REPLAY";
    uint64 constant WINDOW = 120;
    uint128 constant PBOND = 1e6;
    uint128 constant UP = 180_000; // $0.18
    uint128 constant CONT = 1_600_000; // $1.60
    uint128 constant BOND = 4_200_000; // $4.20
    uint8 constant N = 12;
    uint8 constant K = 3;
    string constant BODY = "sealed federal fraud cases will produce a DOJ settlement release by Oct 11";

    function setUp() public {
        usdc = new MockUSDC();
        market = new VerityMarket(usdc, pool, WINDOW, PBOND);
        bids = new StandingBids(market);
        market.setResolver(DOJ, true, false);
        market.setResolver(REPLAY, true, true);
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

    function _params(uint64 deadlineIn, uint64 exclusivity) internal view returns (VerityMarket.CommitParams memory) {
        return VerityMarket.CommitParams({
            n: N,
            k: K,
            itemsRoot: keccak256("root"),
            teaserBody: BODY,
            payloadHash: keccak256("payload"),
            resolverId: DOJ,
            deadline: uint64(block.timestamp) + deadlineIn,
            exclusivitySeconds: exclusivity,
            upfront: UP,
            contingent: CONT,
            bond: BOND,
            confidenceBps: 8000,
            domain: "fca:healthcare",
            attestation: market.ATTESTATION(),
            payloadURI: "ipfs://x",
            bloom: hex"00ff"
        });
    }

    function _commitWith(VerityMarket.CommitParams memory p) internal returns (uint256) {
        vm.prank(seller);
        return market.commit(p);
    }

    function _commit(uint64 deadlineIn, uint64 exclusivity) internal returns (uint256) {
        return _commitWith(_params(deadlineIn, exclusivity));
    }

    function _expectCommitRevert(VerityMarket.CommitParams memory p, bytes4 sel) internal {
        vm.prank(seller);
        vm.expectRevert(sel);
        market.commit(p);
    }

    // 3 hits (bits 0, 4, 11): exactly k.
    uint64 constant MASK_K = (1 << 0) | (1 << 4) | (1 << 11);
    // 2 hits: k - 1.
    uint64 constant MASK_K1 = (1 << 0) | (1 << 4);

    function _proposeAndSettle(uint256 id, VerityMarket.Outcome o, uint64 mask) internal {
        vm.prank(proposer);
        market.propose(id, o, mask, "evidence");
        vm.warp(block.timestamp + WINDOW);
        market.settle(id);
    }

    // ---------------------------------------------------------------- commit validation

    function test_commitComposesTeaserAndPullsBond() public {
        uint256 before = usdc.balanceOf(seller);
        uint256 id = _commit(1 days, 2 days);
        assertEq(before - usdc.balanceOf(seller), BOND);
        assertEq(market.teaser(id), string.concat("3 of 12 ", BODY));
        VerityMarket.Claim memory c = market.getClaim(id);
        assertEq(c.n, N);
        assertEq(c.k, K);
        assertEq(c.itemsRoot, keccak256("root"));
    }

    function test_commitRejectsUnlistedResolver() public {
        VerityMarket.CommitParams memory p = _params(1 days, 2 days);
        p.resolverId = "BUYER_BLOG"; // hard rule 3: buyer-controlled resolution is not whitelisted
        _expectCommitRevert(p, VerityMarket.NotWhitelisted.selector);
    }

    function test_commitBounds() public {
        VerityMarket.CommitParams memory p = _params(1 days, 2 days);
        p.k = 0;
        _expectCommitRevert(p, VerityMarket.BadParams.selector);
        p = _params(1 days, 2 days);
        p.k = 13; // k > n
        _expectCommitRevert(p, VerityMarket.BadParams.selector);
        p = _params(1 days, 2 days);
        p.n = 65;
        p.k = 1;
        _expectCommitRevert(p, VerityMarket.BadParams.selector);
        p = _params(1 days, 2 days);
        p.itemsRoot = bytes32(0);
        _expectCommitRevert(p, VerityMarket.BadParams.selector);
        p = _params(1 days, 2 days);
        p.teaserBody = "";
        _expectCommitRevert(p, VerityMarket.BadParams.selector);
        p = _params(1 days, 2 days);
        p.teaserBody = string(new bytes(241));
        _expectCommitRevert(p, VerityMarket.BadParams.selector);
        p = _params(120 days + 1, 2 days); // window cap
        _expectCommitRevert(p, VerityMarket.BadParams.selector);

        // Edges that must pass: n = k = 64, 240-byte teaser, exactly 120 days.
        p = _params(120 days, 2 days);
        p.n = 64;
        p.k = 64;
        p.teaserBody = string(new bytes(240));
        uint256 id = _commitWith(p);
        assertEq(market.getClaim(id).n, 64);
    }

    // ---------------------------------------------------------------- purchase / key

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

    function test_noPurchaseAfterExclusivity() public {
        uint256 id = _commit(3 days, 1 hours);
        vm.warp(block.timestamp + 1 hours);
        vm.prank(buyer);
        vm.expectRevert(VerityMarket.TooLate.selector);
        market.purchase(id);
    }

    // ---------------------------------------------------------------- mask rules

    function test_popcount() public view {
        assertEq(market.popcount(0), 0);
        assertEq(market.popcount(MASK_K), 3);
        assertEq(market.popcount(type(uint64).max), 64);
    }

    function test_proposeTrueAtExactlyKEarly() public {
        uint256 id = _commit(30 days, 60 days);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, MASK_K, "x"); // before the deadline: early TRUE is allowed
        assertEq(market.getClaim(id).proposedMask, MASK_K);
    }

    function test_proposeTrueRejectsKMinusOne() public {
        uint256 id = _commit(30 days, 60 days);
        vm.prank(proposer);
        vm.expectRevert(VerityMarket.BadParams.selector);
        market.propose(id, VerityMarket.Outcome.TRUE, MASK_K1, "x");
    }

    function test_proposeRejectsMaskOutsideN() public {
        uint256 id = _commit(30 days, 60 days);
        vm.prank(proposer);
        vm.expectRevert(VerityMarket.BadParams.selector);
        market.propose(id, VerityMarket.Outcome.TRUE, MASK_K | (1 << 12), "x"); // bit 12 = item 13 of 12
    }

    function test_proposeFalseRules() public {
        uint256 id = _commit(1 days, 5 days);
        vm.startPrank(proposer);
        vm.expectRevert(VerityMarket.TooEarly.selector);
        market.propose(id, VerityMarket.Outcome.FALSE, MASK_K1, "x");
        vm.warp(block.timestamp + 1 days);
        vm.expectRevert(VerityMarket.BadParams.selector);
        market.propose(id, VerityMarket.Outcome.FALSE, MASK_K, "x"); // k hits is not FALSE
        market.propose(id, VerityMarket.Outcome.FALSE, MASK_K1, "x");
        vm.stopPrank();
    }

    function test_proposeFabricatedIgnoresMask() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.FABRICATED, type(uint64).max, "x");
        assertEq(market.getClaim(id).proposedMask, 0);
    }

    function test_proposeRejectsNone() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(proposer);
        vm.expectRevert(VerityMarket.BadParams.selector);
        market.propose(id, VerityMarket.Outcome.NONE, 0, "x");
    }

    function test_fullWidthBasketAcceptsTopBit() public {
        VerityMarket.CommitParams memory p = _params(1 days, 5 days);
        p.n = 64;
        p.k = 1;
        uint256 id = _commitWith(p);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE, uint64(1) << 63);
        assertEq(market.getClaim(id).hits, 1);
    }

    // ---------------------------------------------------------------- payouts

    // Outcome 1: true and public by deadline -> contingent to seller, bond returned, hits recorded.
    function test_settle_truePublic() public {
        uint256 id = _commit(1 days, 2 days);
        vm.prank(buyer);
        market.purchase(id);
        vm.prank(oracle);
        market.markPublished(id, "doj://release");
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE, MASK_K);
        assertEq(usdc.balanceOf(seller) - s0, CONT + BOND);
        assertEq(usdc.balanceOf(pool), 0);
        assertEq(usdc.balanceOf(proposer), 100e6);
        VerityMarket.Claim memory c = market.getClaim(id);
        assertEq(c.hits, 3);
        assertEq(c.hitMask, MASK_K);
        VerityMarket.SellerRecord memory r = market.getSellerRecord(seller);
        assertEq(r.itemsCommitted, N);
        assertEq(r.itemsHit, 3);
    }

    // Auto-release before the deadline counts as publication.
    function test_settle_trueAutoReleased() public {
        uint256 id = _commit(2 days, 1 days);
        vm.prank(buyer);
        market.purchase(id);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE, MASK_K);
        assertEq(usdc.balanceOf(seller) - s0, CONT + BOND);
    }

    // Outcome 2: true, not public by deadline -> contingent to pool, not the buyer. Suppression never pays.
    function test_settle_trueSuppressed() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        uint256 b0 = usdc.balanceOf(buyer);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE, MASK_K);
        assertEq(usdc.balanceOf(pool), CONT);
        assertEq(usdc.balanceOf(buyer), b0);
        assertEq(usdc.balanceOf(seller) - s0, BOND);
    }

    // Outcome 3: false -> contingent refunded, 50% of bond slashed, half to buyers and half to pool. Misses still count.
    function test_settle_falseHalfSlash() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        vm.prank(buyer2);
        market.purchase(id);
        uint256 b0 = usdc.balanceOf(buyer);
        uint256 s0 = usdc.balanceOf(seller);
        vm.warp(block.timestamp + 1 days);
        _proposeAndSettle(id, VerityMarket.Outcome.FALSE, MASK_K1);
        uint128 slashed = BOND / 2;
        uint128 each = (slashed / 2) / 2;
        assertEq(usdc.balanceOf(buyer) - b0, CONT + each);
        assertEq(usdc.balanceOf(seller) - s0, BOND - slashed);
        assertEq(usdc.balanceOf(pool), slashed - each * 2);
        assertEq(usdc.balanceOf(address(market)), 0);
        VerityMarket.SellerRecord memory r = market.getSellerRecord(seller);
        assertEq(r.itemsCommitted, N);
        assertEq(r.itemsHit, 2);
        assertEq(r.resolvedFalse, 1);
    }

    // Outcome 4: fabricated -> contingent refunded, 100% slash: buyer made whole on upfront, remainder to pool.
    //            Fabricated items are not counted toward lift.
    function test_settle_fabricatedFullSlash() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        uint256 b0 = usdc.balanceOf(buyer);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.FABRICATED, 0);
        assertEq(usdc.balanceOf(buyer) - b0, CONT + UP);
        assertEq(usdc.balanceOf(seller), s0);
        assertEq(usdc.balanceOf(pool), BOND - UP);
        VerityMarket.SellerRecord memory r = market.getSellerRecord(seller);
        assertEq(r.fabricated, 1);
        assertEq(r.bondsSlashed, BOND);
        assertEq(r.itemsCommitted, 0);
    }

    // ---------------------------------------------------------------- disputes

    // Outcome 5: dispute -> owner backstop; disputer wins both proposer bonds.
    function test_dispute_ownerBackstop() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(buyer);
        market.purchase(id);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, MASK_K, "x");
        vm.prank(disputer);
        market.dispute(id);
        vm.expectRevert(VerityMarket.WrongStatus.selector);
        market.settle(id);
        uint256 d0 = usdc.balanceOf(disputer);
        market.resolveDispute(id, VerityMarket.Outcome.FABRICATED, 0);
        assertEq(usdc.balanceOf(disputer) - d0, 2 * PBOND);
        assertEq(uint8(market.getClaim(id).outcome), uint8(VerityMarket.Outcome.FABRICATED));
    }

    // Same outcome, corrected mask: the disputer was right about the mask, so the disputer wins.
    function test_dispute_correctedMask() public {
        uint256 id = _commit(1 days, 5 days);
        uint64 overclaimed = MASK_K | (1 << 7);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, overclaimed, "x");
        vm.prank(disputer);
        market.dispute(id);
        // The corrected mask must still be consistent with the outcome.
        vm.expectRevert(VerityMarket.BadParams.selector);
        market.resolveDispute(id, VerityMarket.Outcome.TRUE, MASK_K1);
        uint256 d0 = usdc.balanceOf(disputer);
        market.resolveDispute(id, VerityMarket.Outcome.TRUE, MASK_K);
        assertEq(usdc.balanceOf(disputer) - d0, 2 * PBOND);
        assertEq(market.getClaim(id).hits, 3);
        assertEq(market.getSellerRecord(seller).itemsHit, 3);
    }

    function test_dispute_proposerWinsWhenUpheld() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, MASK_K, "x");
        vm.prank(disputer);
        market.dispute(id);
        uint256 p0 = usdc.balanceOf(proposer);
        market.resolveDispute(id, VerityMarket.Outcome.TRUE, MASK_K);
        assertEq(usdc.balanceOf(proposer) - p0, 2 * PBOND);
    }

    function test_cannotDisputeAfterWindow() public {
        uint256 id = _commit(1 days, 5 days);
        vm.prank(proposer);
        market.propose(id, VerityMarket.Outcome.TRUE, MASK_K, "x");
        vm.warp(block.timestamp + WINDOW);
        vm.prank(disputer);
        vm.expectRevert(VerityMarket.TooLate.selector);
        market.dispute(id);
    }

    // ---------------------------------------------------------------- replay

    function test_replayClaimsLeaveNoRecord() public {
        VerityMarket.CommitParams memory p = _params(2 days, 1 days); // auto-released before the deadline
        p.resolverId = REPLAY;
        uint256 id = _commitWith(p);
        vm.prank(buyer);
        market.purchase(id);
        uint256 s0 = usdc.balanceOf(seller);
        _proposeAndSettle(id, VerityMarket.Outcome.TRUE, MASK_K);
        assertEq(usdc.balanceOf(seller) - s0, CONT + BOND); // pays out normally
        VerityMarket.SellerRecord memory r = market.getSellerRecord(seller);
        assertEq(r.commits, 0);
        assertEq(r.settled, 0);
        assertEq(r.itemsCommitted, 0);
        assertEq(r.earned, 0);
        assertEq(r.bondsPosted, 0);
        assertTrue(market.replayResolver(REPLAY));
        assertFalse(market.replayResolver(DOJ));
    }

    // ---------------------------------------------------------------- merkle: TS commitment verifies on chain

    // Fixture produced by app/lib/merkle.ts (commitBasket over 5 salted items); the odd leaf exercises promotion.
    function test_merkleFixtureFromTypescript() public {
        VerityMarket.CommitParams memory p = _params(1 days, 2 days);
        p.n = 5;
        p.k = 1;
        p.itemsRoot = 0xceee3626d2463d7842f07888e2a2ee7a7a4eb9475460d16f2a146f05e78e7ea6;
        uint256 id = _commitWith(p);

        bytes32[] memory proof3 = new bytes32[](3);
        proof3[0] = 0x958757f3d86e74bf02a3bcf33ff3a38e0a7b460ee82c097d7037d2898da5f2d9;
        proof3[1] = 0x050493bb5c7b9fb06aaff9ae66fa49c04ef1fd4b9945d16c5013d2ac78cc4680;
        proof3[2] = 0x38c417c821f36ebdebfe405c1066efef78c08475e8fbf4bce16c35fadadcadeb;
        bytes32 h3 = 0xbfcf2cee5d7f5a61766af830b7d02f8f8dfeed31b5c80f2d0f111e24ea60808d;
        assertTrue(market.verifyItem(id, 3, h3, proof3));
        assertFalse(market.verifyItem(id, 2, h3, proof3)); // index is bound into the leaf

        bytes32[] memory proof4 = new bytes32[](1);
        proof4[0] = 0x57f4b668f63500f1d29d697bbc161341c3e9743f6c48615469d67cb1c937f782;
        bytes32 h4 = 0x5d34cb082d3e7da9070f0390306fb420f213903b2fdd2c9eadc7ec3db1fd783c;
        assertTrue(market.verifyItem(id, 4, h4, proof4));
        assertFalse(market.verifyItem(id, 5, h4, proof4)); // out of range
    }

    // ---------------------------------------------------------------- standing bids against v2

    function test_standingBid_fillAndCancel() public {
        vm.prank(buyer);
        uint256 bidId = bids.postBid("fca:healthcare", DOJ, "any FCA basket, odds < 5%", 5e6, 2000, uint64(block.timestamp + 7 days));
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
