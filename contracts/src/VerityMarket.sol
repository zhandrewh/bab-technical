// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VerityMarket
/// @notice Sealed accountability findings: commit -> purchase -> publish -> propose/dispute -> settle.
/// @dev The commit record ("this seller knew this, then") is the reason this lives on a chain.
///      Trust model: single bonded proposer, permissionless, with a challenge window and an owner backstop
///      for disputed claims. Documented in DESIGN.md.
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
        bytes32 claimHash; // keccak256 of the claim text (the claim itself is sealed in the payload)
        bytes32 payloadHash; // keccak256 of the encrypted evidence envelope
        bytes32 resolverId; // whitelisted institution that can prove the claim wrong
        uint64 deadline; // claim must resolve by this time
        uint64 exclusivitySeconds; // fixed at commit; after this the key opens to everyone
        uint128 upfront; // USDC (6dp) paid to seller at purchase, before decay
        uint128 contingent; // USDC held by contract until settlement
        uint128 bond; // USDC staked by seller
        uint16 confidenceBps; // seller's stated probability the claim resolves TRUE (calibration input)
        bytes32 domain; // domain tag, e.g. "fedreg:hhs"
        bytes32 attestation; // must equal ATTESTATION: no classified material, no MNPI (hard rule 4)
        string payloadURI; // where the encrypted envelope lives (IPFS)
        bytes bloom; // Bloom filter of normalized entity identifiers (relevance preview; NOT PSI)
    }

    struct Claim {
        address seller;
        Status status;
        Outcome proposed;
        Outcome outcome;
        uint16 confidenceBps;
        uint8 buyerCount;
        uint64 committedAt;
        uint64 deadline;
        uint64 exclusivityEnd;
        uint64 publishedAt;
        uint64 proposedAt;
        uint128 upfront;
        uint128 contingent;
        uint128 bond;
        uint128 contingentEscrow;
        bytes32 claimHash;
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
        uint128 bondsPosted;
        uint128 bondsSlashed;
        uint128 earned;
    }

    bytes32 public constant ATTESTATION = keccak256(
        "VERITY-ATTESTATION-V1: evidence derived solely from lawfully obtained public records; no classified material; no material non-public information."
    );
    uint8 public constant MAX_BUYERS = 16;

    IERC20 public immutable usdc;
    uint64 public immutable challengeWindow;
    uint128 public immutable proposerBond;
    address public pool; // public-goods pool

    mapping(bytes32 => bool) public resolvers;
    mapping(address => bool) public oracles; // may call markPublished

    Claim[] internal _claims;
    mapping(uint256 => address[]) internal _buyers;
    mapping(uint256 => mapping(address => bool)) public purchased;
    mapping(uint256 => mapping(address => uint128)) public paidUpfront;
    mapping(address => SellerRecord) internal _sellers;

    event Committed(
        uint256 indexed claimId,
        address indexed seller,
        bytes32 claimHash,
        bytes32 payloadHash,
        bytes32 indexed resolverId,
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
    event Proposed(uint256 indexed claimId, address indexed proposer, Outcome outcome, string evidenceURI);
    event Disputed(uint256 indexed claimId, address indexed disputer);
    event DisputeResolved(uint256 indexed claimId, Outcome outcome, address winner, uint128 bondsAwarded);
    event Settled(
        uint256 indexed claimId,
        Outcome outcome,
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
    event ResolverSet(bytes32 indexed resolverId, bool allowed);
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

    function setResolver(bytes32 id, bool allowed) external onlyOwner {
        resolvers[id] = allowed;
        emit ResolverSet(id, allowed);
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
        if (p.deadline <= block.timestamp || p.exclusivitySeconds == 0 || p.upfront + p.contingent == 0) revert BadParams();
        if (p.confidenceBps > 10_000 || p.bond == 0) revert BadParams();

        id = _claims.length;
        uint64 exclusivityEnd = uint64(block.timestamp) + p.exclusivitySeconds;
        _claims.push(
            Claim({
                seller: msg.sender,
                status: Status.OPEN,
                proposed: Outcome.NONE,
                outcome: Outcome.NONE,
                confidenceBps: p.confidenceBps,
                buyerCount: 0,
                committedAt: uint64(block.timestamp),
                deadline: p.deadline,
                exclusivityEnd: exclusivityEnd,
                publishedAt: 0,
                proposedAt: 0,
                upfront: p.upfront,
                contingent: p.contingent,
                bond: p.bond,
                contingentEscrow: 0,
                claimHash: p.claimHash,
                payloadHash: p.payloadHash,
                resolverId: p.resolverId,
                domain: p.domain,
                proposer: address(0),
                disputer: address(0)
            })
        );
        SellerRecord storage r = _sellers[msg.sender];
        r.commits++;
        r.bondsPosted += p.bond;

        usdc.safeTransferFrom(msg.sender, address(this), p.bond);

        emit Committed(
            id,
            msg.sender,
            p.claimHash,
            p.payloadHash,
            p.resolverId,
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
        _sellers[c.seller].earned += up;

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

    // ---------------------------------------------------------------- oracle

    function markPublished(uint256 id, string calldata evidenceURI) external {
        if (!oracles[msg.sender] && msg.sender != owner()) revert Unauthorized();
        Claim storage c = _claims[id];
        if (c.publishedAt != 0 || c.status == Status.SETTLED) revert WrongStatus();
        c.publishedAt = uint64(block.timestamp);
        emit Published(id, evidenceURI, c.publishedAt);
    }

    /// @notice Permissionless bonded proposal. TRUE and FABRICATED may be proposed any time; FALSE only after the deadline.
    function propose(uint256 id, Outcome outcome, string calldata evidenceURI) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.OPEN) revert WrongStatus();
        if (outcome == Outcome.NONE) revert BadParams();
        if (outcome == Outcome.FALSE && block.timestamp < c.deadline) revert TooEarly();
        c.status = Status.PROPOSED;
        c.proposed = outcome;
        c.proposer = msg.sender;
        c.proposedAt = uint64(block.timestamp);
        usdc.safeTransferFrom(msg.sender, address(this), proposerBond);
        emit Proposed(id, msg.sender, outcome, evidenceURI);
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

    /// @notice Owner backstop for the disputed residue. Winner takes both bonds.
    function resolveDispute(uint256 id, Outcome outcome) external onlyOwner nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.DISPUTED) revert WrongStatus();
        if (outcome == Outcome.NONE) revert BadParams();
        address winner = outcome == c.proposed ? c.proposer : c.disputer;
        usdc.safeTransfer(winner, proposerBond * 2);
        emit DisputeResolved(id, outcome, winner, proposerBond * 2);
        _settle(id, outcome);
    }

    function settle(uint256 id) external nonReentrant {
        Claim storage c = _claims[id];
        if (c.status != Status.PROPOSED) revert WrongStatus();
        if (block.timestamp < c.proposedAt + challengeWindow) revert TooEarly();
        usdc.safeTransfer(c.proposer, proposerBond);
        _settle(id, c.proposed);
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

    /// @dev Implements the settlement table (spec 2.5) exactly.
    function _settle(uint256 id, Outcome outcome) internal {
        Claim storage c = _claims[id];
        c.status = Status.SETTLED;
        c.outcome = outcome;
        SellerRecord storage r = _sellers[c.seller];
        r.settled++;

        Accounting memory a;
        // Auto-release counts as publication: if exclusivity expired before the deadline, the package was public.
        a.publicByDeadline = (c.publishedAt != 0 && c.publishedAt <= c.deadline) || c.exclusivityEnd <= c.deadline;
        address[] storage buyers = _buyers[id];
        uint256 n = buyers.length;

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

        if (a.toSeller + a.bondReturned > 0) usdc.safeTransfer(c.seller, a.toSeller + a.bondReturned);
        if (a.toPool + a.slashToPool > 0) usdc.safeTransfer(pool, a.toPool + a.slashToPool);

        emit Settled(
            id, outcome, a.publicByDeadline, a.toSeller, a.toPool, a.refunded, a.bondReturned, a.slashed, a.slashToBuyers, a.slashToPool
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
