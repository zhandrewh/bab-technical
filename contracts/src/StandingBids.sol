// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {VerityMarket} from "./VerityMarket.sol";

/// @title StandingBids
/// @notice "$2,000 for any resolvable claim touching HHS contracting, seller Brier under 0.20."
///         Buyers escrow USDC up front; sellers fill with a committed claim, which routes into a normal purchase.
/// @dev Brier eligibility is computed off-chain from the Settled event log and enforced by the bidder's
///      criteria and the UI, not in this contract (documented in DESIGN.md).
contract StandingBids is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Bid {
        address bidder;
        uint128 amount;
        uint64 expiry;
        uint16 maxBrierBps;
        bool open;
        bytes32 domain;
        bytes32 resolverId; // 0 = any whitelisted resolver
        string criteria;
    }

    VerityMarket public immutable market;
    IERC20 public immutable usdc;
    Bid[] internal _bids;

    event BidPosted(
        uint256 indexed bidId,
        address indexed bidder,
        bytes32 domain,
        bytes32 resolverId,
        uint128 amount,
        uint16 maxBrierBps,
        uint64 expiry,
        string criteria
    );
    event BidFilled(uint256 indexed bidId, uint256 indexed claimId, address indexed seller, uint128 paid, uint128 refunded);
    event BidCancelled(uint256 indexed bidId, uint128 refunded);

    error BadBid();
    error Unauthorized();

    constructor(VerityMarket market_) {
        market = market_;
        usdc = market_.usdc();
    }

    function postBid(bytes32 domain, bytes32 resolverId, string calldata criteria, uint128 amount, uint16 maxBrierBps, uint64 expiry)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (amount == 0 || expiry <= block.timestamp) revert BadBid();
        id = _bids.length;
        _bids.push(Bid(msg.sender, amount, expiry, maxBrierBps, true, domain, resolverId, criteria));
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit BidPosted(id, msg.sender, domain, resolverId, amount, maxBrierBps, expiry, criteria);
    }

    function fillBid(uint256 bidId, uint256 claimId) external nonReentrant {
        Bid storage b = _bids[bidId];
        if (!b.open || block.timestamp >= b.expiry) revert BadBid();
        VerityMarket.Claim memory c = market.getClaim(claimId);
        if (c.seller != msg.sender) revert Unauthorized();
        if (b.resolverId != bytes32(0) && b.resolverId != c.resolverId) revert BadBid();
        uint128 price = market.currentPrice(claimId);
        if (price > b.amount) revert BadBid();

        b.open = false;
        usdc.forceApprove(address(market), price);
        market.purchaseFor(claimId, b.bidder);
        uint128 refund = b.amount - price;
        if (refund > 0) usdc.safeTransfer(b.bidder, refund);
        emit BidFilled(bidId, claimId, msg.sender, price, refund);
    }

    function cancelBid(uint256 bidId) external nonReentrant {
        Bid storage b = _bids[bidId];
        if (b.bidder != msg.sender) revert Unauthorized();
        if (!b.open) revert BadBid();
        b.open = false;
        usdc.safeTransfer(b.bidder, b.amount);
        emit BidCancelled(bidId, b.amount);
    }

    function bidCount() external view returns (uint256) {
        return _bids.length;
    }

    function getBid(uint256 bidId) external view returns (Bid memory) {
        return _bids[bidId];
    }
}
