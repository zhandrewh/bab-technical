// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title VerityMarket v2
/// @notice Sealed k-of-N baskets: "3 of 12 sealed items will appear on the resolver's list by D". The numbers are public
///         and composed by this contract; *which* items is the sealed good, bound by a Merkle root at commit.
///         commit -> purchase -> publish -> propose(hitMask)/dispute -> settle.
/// @dev Trust model: single bonded proposer, permissionless, with a challenge window and an owner backstop for
///      disputed claims. Documented in DESIGN.md.
contract VerityMarket is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Outcome {
        NONE,
        TRUE,
        FALSE,
        FABRICATED
    }

    enum Status {
        OPEN,
        PROPOSED,
        DISPUTED,
        SETTLED
    }

    struct CommitParams {
        uint8 n; // items in the sealed basket
        uint8 k; // the claim: at least k of n items hit by the deadline
        bytes32 itemsRoot; // Merkle root over salted item hashes (OZ MerkleProof, sorted pairs)
        string teaserBody; // public headline after the contract-composed "{k} of {n} " prefix
        bytes32 payloadHash; // keccak256 of the encrypted evidence envelope
        bytes32 resolverId; // whitelisted institution whose public list resolves the items
        uint64 deadline; // claim must resolve by this time
        uint64 exclusivitySeconds; // fixed at commit; after this the key opens to everyone
        uint128 upfront; // USDC (6dp) paid to seller at purchase, before decay
        uint128 contingent; // USDC held by contract until settlement
        uint128 bond; // USDC staked by seller
        uint16 confidenceBps; // seller's stated P(hits >= k) (calibration input)
        bytes32 domain; // domain tag, e.g. "fca:healthcare"
        bytes32 attestation; // must equal ATTESTATION: no classified material, no MNPI (hard rule 4)
        string payloadURI; // where the encrypted envelope lives (IPFS or calldata)
        bytes bloom; // Bloom filter of normalized entity identifiers (relevance preview; NOT PSI)
    }

    struct Claim {
        address seller;
        Status status;
        Outcome proposed;
        Outcome outcome;
        uint8 n;
        uint8 k;
        uint8 hits;
        uint16 confidenceBps;
        uint8 buyerCount;
        uint64 committedAt;
        uint64 deadline;
        uint64 exclusivityEnd;
        uint64 publishedAt;
        uint64 proposedAt;
        uint64 proposedMask;
        uint64 hitMask;
        uint128 upfront;
        uint128 contingent;
        uint128 bond;
        uint128 contingentEscrow;
        bytes32 itemsRoot;
        bytes32 payloadHash;
        bytes32 resolverId;
        bytes32 domain;
        address proposer;
        address disputer;
    }

    struct SellerRecord {
        uint32 commits;
        uint32 settled;
        uint32 resolvedTrue;
        uint32 resolvedFalse;
        uint32 fabricated;
        uint32 itemsCommitted; // sum of n over settled, non-fabricated claims
        uint32 itemsHit; // sum of hits over the same claims (lift = itemsHit/itemsCommitted / base rate)
        uint128 bondsPosted;
        uint128 bondsSlashed;
        uint128 earned;
    }

    bytes32 public constant ATTESTATION = keccak256(
        "VERITY-ATTESTATION-V1: evidence derived solely from lawfully obtained public records; no classified material; no material non-public information."
    );
    uint8 public constant MAX_BUYERS = 16;
    uint8 public constant MAX_ITEMS = 64;
    uint256 public constant MAX_TEASER = 240;
    uint64 public constant MAX_WINDOW = 120 days;

    IERC20 public immutable usdc;
    uint64 public immutable challengeWindow;
    uint128 public immutable proposerBond;
    address public pool; // public-goods pool

    mapping(bytes32 => bool) public resolvers;
    /// @notice Replay resolvers settle backtest baskets (asOf in the past). They never touch SellerRecord.
    mapping(bytes32 => bool) public replayResolver;
    mapping(address => bool) public oracles; // may call markPublished
    mapping(uint256 => string) public teaser;

    Claim[] internal _claims;
    mapping(uint256 => address[]) internal _buyers;
    mapping(uint256 => mapping(address => bool)) public purchased;
    mapping(uint256 => mapping(address => uint128)) public paidUpfront;
    mapping(address => SellerRecord) internal _sellers;

    event Committed(
        uint256 indexed claimId,
        address indexed seller,
        bytes32 indexed resolverId,
        uint8 n,
        uint8 k,
        bytes32 itemsRoot,
        string teaser,
        bytes32 payloadHash,
        bytes32 domain,
        uint64 deadline,
        uint64 exclusivityEnd,
        uint128 upfront,
        uint128 contingent,
        uint128 bond,
        uint16 confidenceBps,
        string payloadURI,
        bytes bloom
    );
    event Purchased(uint256 indexed claimId, address indexed buyer, address payer, uint128 upfrontPaid, uint128 contingentEscrowed);
    event Published(uint256 indexed claimId, string evidenceURI, uint64 publishedAt);
    event Proposed(uint256 indexed claimId, address indexed proposer, Outcome outcome, uint64 hitMask, string evidenceURI);
    event Disputed(uint256 indexed claimId, address indexed disputer);
    event DisputeResolved(uint256 indexed claimId, Outcome outcome, uint64 hitMask, address winner, uint128 bondsAwarded);
    event Settled(
        uint256 indexed claimId,
        Outcome outcome,
        uint8 hits,
        uint64 hitMask,
        bool publicByDeadline,
        uint128 contingentToSeller,
        uint128 contingentToPool,
        uint128 contingentRefunded,
        uint128 bondReturned,
        uint128 bondSlashed,
        uint128 slashToBuyers,
        uint128 slashToPool
    );
    event Slashed(uint256 indexed claimId, address indexed seller, Outcome outcome, uint128 amount, uint128 toBuyers, uint128 toPool);
    event ResolverSet(bytes32 indexed resolverId, bool allowed, bool replay);
    event OracleSet(address indexed oracle, bool allowed);

    error BadParams();
    error NotWhitelisted();
    error WrongStatus();
    error TooEarly();
    error TooLate();
    error AlreadyPurchased();
    error Unauthorized();

    constructor(IERC20 usdc_, address pool_, uint64 challengeWindow_, uint128 proposerBond_) Ownable(msg.sender) {
        usdc = usdc_;
        pool = pool_;
        challengeWindow = challengeWindow_;
        proposerBond = proposerBond_;
    }

    // ---------------------------------------------------------------- admin

    function setResolver(bytes32 id, bool allowed, bool replay) external onlyOwner {
        resolvers[id] = allowed;
        replayResolver[id] = replay;
        emit ResolverSet(id, allowed, replay);
    }

    function setOracle(address who, bool allowed) external onlyOwner {
        oracles[who] = allowed;
        emit OracleSet(who, allowed);
    }

    function setPool(address pool_) external onlyOwner {
        pool = pool_;
    }

    // ---------------------------------------------------------------- commit

    function commit(CommitParams calldata p) external nonReentrant returns (uint256 id) {
        if (!resolvers[p.resolverId]) revert NotWhitelisted();
        if (p.attestation != ATTESTATION) revert BadParams();
        if (p.deadline <= block.timestamp || p.deadline - block.timestamp > MAX_WINDOW) revert BadParams();
        if (p.exclusivitySeconds == 0 || p.upfront + p.contingent == 0) revert BadParams();
        if (p.confidenceBps > 10_000 || p.bond == 0) revert BadParams();
        if (p.k == 0 || p.k > p.n || p.n > MAX_ITEMS || p.itemsRoot == bytes32(0)) revert BadParams();
        uint256 len = bytes(p.teaserBody).length;
        if (len == 0 || len > MAX_TEASER) revert BadParams();

        id = _claims.length;
        uint64 exclusivityEnd = uint64(block.timestamp) + p.exclusivitySeconds;
        Claim storage c = _claims.push();
        c.seller = msg.sender;
        c.n = p.n;
        c.k = p.k;
        c.confidenceBps = p.confidenceBps;
        c.committedAt = uint64(block.timestamp);
        c.deadline = p.deadline;
        c.exclusivityEnd = exclusivityEnd;
        c.upfront = p.upfront;
        c.contingent = p.contingent;
        c.bond = p.bond;
        c.itemsRoot = p.itemsRoot;
        c.payloadHash = p.payloadHash;
        c.resolverId = p.resolverId;
        c.domain = p.domain;

        // The seller cannot misstate the numbers: the contract writes them.
        string memory t = string.concat(Strings.toString(p.k), " of ", Strings.toString(p.n), " ", p.teaserBody);
        teaser[id] = t;

        if (!replayResolver[p.resolverId]) {
            SellerRecord storage r = _sellers[msg.sender];
            r.commits++;
            r.bondsPosted += p.bond;
        }

        usdc.safeTransferFrom(msg.sender, address(this), p.bond);

        emit Committed(
            id,
            msg.sender,
            p.resolverId,
            p.n,
            p.k,
            p.itemsRoot,
            t,
            p.payloadHash,
            p.domain,
            p.deadline,
            exclusivityEnd,
            p.upfront,
            p.contingent,
            p.bond,
            p.confidenceBps,
            p.payloadURI,
            p.bloom
        );
    }

    // ---------------------------------------------------------------- purchase

    /// @notice Decay curve: the upfront ask falls linearly to 50% over the exclusivity window. Leads rot.
    function currentUpfront(uint256 id) public view returns (uint128) {
        Claim storage c = _claims[id];
        if (block.timestamp >= c.exclusivityEnd) return c.upfront / 2;
        uint256 elapsed = block.timestamp - c.committedAt;
        uint256 window = c.exclusivityEnd - c.committedAt;
        return c.upfront - uint128((uint256(c.upfront) / 2) * elapsed / window);
    }

    function currentPrice(uint256 id) external view returns (uint128) {
        return currentUpfront(id) + _claims[id].contingent;
    }

    function purchase(uint256 id) external returns (uint128) {
        return _purchase(id, msg.sender);
    }

    /// @notice Purchase on behalf of `buyer`; the caller pays. Used by the x402 relayer and StandingBids.
    function purchaseFor(uint256 id, address buyer) external returns (uint128) {
        return _purchase(id, buyer);
    }

    function _purchase(uint256 id, address buyer) internal nonReentrant returns (uint128 total) {
        Claim storage c = _claims[id];
        if (c.status != Status.OPEN) revert WrongStatus();
        if (block.timestamp >= c.exclusivityEnd || block.timestamp >= c.deadline) revert TooLate();
        if (buyer == c.seller || buyer == address(0)) revert Unauthorized();
        if (purchased[id][buyer]) revert AlreadyPurchased();
        if (c.buyerCount >= MAX_BUYERS) revert BadParams();

        uint128 up = currentUpfront(id);
        purchased[id][buyer] = true;
        paidUpfront[id][buyer] = up;
        _buyers[id].push(buyer);
        c.buyerCount++;
        c.contingentEscrow += c.contingent;
        if (!replayResolver[c.resolverId]) _sellers[c.seller].earned += up;

        if (up > 0) usdc.safeTransferFrom(msg.sender, c.seller, up);
        if (c.contingent > 0) usdc.safeTransferFrom(msg.sender, address(this), c.contingent);

        emit Purchased(id, buyer, msg.sender, up, c.contingent);
        return up + c.contingent;
    }

    // ---------------------------------------------------------------- key release conditions

    /// @notice The exact condition the key-release layer evaluates. Neither party can move exclusivityEnd.
    function canDecrypt(uint256 id, address who) external view returns (bool) {
        return purchased[id][who] || block.timestamp >= _claims[id].exclusivityEnd;
    }

    function isPublic(uint256 id) public view returns (bool) {
        Claim storage c = _claims[id];
        return c.publishedAt != 0 || block.timestamp >= c.exclusivityEnd;
    }

    // ---------------------------------------------------------------- items

    /// @notice The leaf for item `index`: double-hashed so it cannot collide with an inner node.
    function itemLeaf(uint256 index, bytes32 itemHash) public pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(index, itemHash))));
    }

    /// @notice Anyone holding the revealed basket can check an item against the committed root.
    function verifyItem(uint256 id, uint256 index, bytes32 itemHash, bytes32[] calldata proof) external view returns (bool) {
        Claim storage c = _claims[id];
        return index < c.n && MerkleProof.verifyCalldata(proof, c.itemsRoot, itemLeaf(index, itemHash));
    }

    function popcount(uint64 x) public pure returns (uint8 count) {
        while (x != 0) {
            x &= x - 1;
            count++;
        }
    }

    /// @dev The mask must agree with the outcome: TRUE needs >= k hits, FALSE fewer than k and only after the deadline.
    ///      FABRICATED ignores the mask.
    function _checkedMask(Claim storage c, Outcome outcome, uint64 mask) internal view returns (uint64) {
        if (outcome == Outcome.NONE) revert BadParams();
        if (outcome == Outcome.FABRICATED) return 0;
        if (c.n < 64 && mask >> c.n != 0) revert BadParams();
        uint8 hits = popcount(mask);
        if (outcome == Outcome.TRUE) {
            if (hits < c.k) revert BadParams();
        } else {
            if (hits >= c.k) revert BadParams();
            if (block.timestamp < c.deadline) revert TooEarly();
        }
        return mask;
    }

    // ---------------------------------------------------------------- oracle

    function markPublished(uint256 id, string calldata evidenceURI) external {
        if (!oracles[msg.sender] && msg.sender != owner()) revert Unauthorized();
        Claim storage c = _claims[id];
        if (c.publishedAt != 0 || c.status == Status.SETTLED) revert WrongStatus();
        c.publishedAt = uint64(block.timestamp);
        emit Published(id, evidenceURI, c.publishedAt);
    }

    /// @notice Permissionless bonded proposal. TRUE (once k items hit) and FABRICATED may be proposed any time;
    ///         FALSE only after the deadline.
    function propose(uint256 id, Outcome outcome, uint64 hitMask, string calldata evidenceURI) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.OPEN) revert WrongStatus();
        uint64 mask = _checkedMask(c, outcome, hitMask);
        c.status = Status.PROPOSED;
        c.proposed = outcome;
        c.proposedMask = mask;
        c.proposer = msg.sender;
        c.proposedAt = uint64(block.timestamp);
        usdc.safeTransferFrom(msg.sender, address(this), proposerBond);
        emit Proposed(id, msg.sender, outcome, mask, evidenceURI);
    }

    function dispute(uint256 id) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.PROPOSED) revert WrongStatus();
        if (block.timestamp >= c.proposedAt + challengeWindow) revert TooLate();
        c.status = Status.DISPUTED;
        c.disputer = msg.sender;
        usdc.safeTransferFrom(msg.sender, address(this), proposerBond);
        emit Disputed(id, msg.sender);
    }

    /// @notice Owner backstop for the disputed residue, with the corrected mask. Winner takes both bonds: the proposer
    ///         wins only if both the outcome and the mask stand.
    function resolveDispute(uint256 id, Outcome outcome, uint64 hitMask) external onlyOwner nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.DISPUTED) revert WrongStatus();
        uint64 mask = _checkedMask(c, outcome, hitMask);
        address winner = outcome == c.proposed && mask == c.proposedMask ? c.proposer : c.disputer;
        usdc.safeTransfer(winner, proposerBond * 2);
        emit DisputeResolved(id, outcome, mask, winner, proposerBond * 2);
        _settle(id, outcome, mask);
    }

    function settle(uint256 id) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.PROPOSED) revert WrongStatus();
        if (block.timestamp < c.proposedAt + challengeWindow) revert TooEarly();
        usdc.safeTransfer(c.proposer, proposerBond);
        _settle(id, c.proposed, c.proposedMask);
    }

    struct Accounting {
        bool publicByDeadline;
        uint128 toSeller;
        uint128 toPool;
        uint128 refunded;
        uint128 bondReturned;
        uint128 slashed;
        uint128 slashToBuyers;
        uint128 slashToPool;
    }

    /// @dev Implements the settlement table (spec 2.5) exactly. Replay claims pay out normally but leave no record.
    function _settle(uint256 id, Outcome outcome, uint64 mask) internal {
        Claim storage c = _claims[id];
        c.status = Status.SETTLED;
        c.outcome = outcome;
        c.hitMask = mask;
        c.hits = popcount(mask);
        bool record = !replayResolver[c.resolverId];
        SellerRecord memory r = _sellers[c.seller];
        r.settled++;

        Accounting memory a;
        // Auto-release counts as publication: if exclusivity expired before the deadline, the package was public.
        a.publicByDeadline = (c.publishedAt != 0 && c.publishedAt <= c.deadline) || c.exclusivityEnd <= c.deadline;
        address[] storage buyers = _buyers[id];
        uint256 n = buyers.length;

        if (outcome != Outcome.FABRICATED) {
            r.itemsCommitted += c.n;
            r.itemsHit += c.hits;
        }
        if (outcome == Outcome.TRUE) {
            r.resolvedTrue++;
            // Layer 2: suppression is never refunded. Unpublished-true routes to the public-goods pool.
            if (a.publicByDeadline) a.toSeller = c.contingentEscrow;
            else a.toPool = c.contingentEscrow;
            a.bondReturned = c.bond;
        } else {
            a.refunded = c.contingentEscrow;
            for (uint256 i; i < n; i++) {
                if (c.contingent > 0) usdc.safeTransfer(buyers[i], c.contingent);
            }
            if (outcome == Outcome.FALSE) {
                r.resolvedFalse++;
                a.slashed = c.bond / 2;
                a.bondReturned = c.bond - a.slashed;
                if (n > 0) {
                    uint128 each = (a.slashed / 2) / uint128(n);
                    for (uint256 i; i < n; i++) {
                        usdc.safeTransfer(buyers[i], each);
                    }
                    a.slashToBuyers = each * uint128(n);
                }
                a.slashToPool = a.slashed - a.slashToBuyers;
            } else {
                // FABRICATED: 100% slash. Buyers are made whole up to their purchase price; remainder to the pool.
                r.fabricated++;
                a.slashed = c.bond;
                uint128 remaining = c.bond;
                for (uint256 i; i < n; i++) {
                    uint128 comp = paidUpfront[id][buyers[i]];
                    if (comp > remaining) comp = remaining;
                    remaining -= comp;
                    if (comp > 0) usdc.safeTransfer(buyers[i], comp);
                }
                a.slashToBuyers = c.bond - remaining;
                a.slashToPool = remaining;
            }
            r.bondsSlashed += a.slashed;
        }
        c.contingentEscrow = 0;
        r.earned += a.toSeller;
        if (record) _sellers[c.seller] = r;

        if (a.toSeller + a.bondReturned > 0) usdc.safeTransfer(c.seller, a.toSeller + a.bondReturned);
        if (a.toPool + a.slashToPool > 0) usdc.safeTransfer(pool, a.toPool + a.slashToPool);

        emit Settled(
            id,
            outcome,
            c.hits,
            mask,
            a.publicByDeadline,
            a.toSeller,
            a.toPool,
            a.refunded,
            a.bondReturned,
            a.slashed,
            a.slashToBuyers,
            a.slashToPool
        );
        if (a.slashed > 0) emit Slashed(id, c.seller, outcome, a.slashed, a.slashToBuyers, a.slashToPool);
    }

    // ---------------------------------------------------------------- views

    function claimCount() external view returns (uint256) {
        return _claims.length;
    }

    function getClaim(uint256 id) external view returns (Claim memory) {
        return _claims[id];
    }

    function buyersOf(uint256 id) external view returns (address[] memory) {
        return _buyers[id];
    }

    function getSellerRecord(address seller) external view returns (SellerRecord memory) {
        return _sellers[seller];
    }
}
