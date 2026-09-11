// Generated from contracts/out by `npm run abi`. Do not edit.
export const marketAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "usdc_",
    "type": "address",
    "internalType": "contract IERC20"
   },
   {
    "name": "pool_",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "challengeWindow_",
    "type": "uint64",
    "internalType": "uint64"
   },
   {
    "name": "proposerBond_",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "ATTESTATION",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "MAX_BUYERS",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint8",
    "internalType": "uint8"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "buyersOf",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "address[]",
    "internalType": "address[]"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "canDecrypt",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "who",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "challengeWindow",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint64",
    "internalType": "uint64"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "claimCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "commit",
  "inputs": [
   {
    "name": "p",
    "type": "tuple",
    "internalType": "struct VerityMarket.CommitParams",
    "components": [
     {
      "name": "claimHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "payloadHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "resolverId",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "deadline",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "exclusivitySeconds",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "upfront",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "contingent",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "bond",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "confidenceBps",
      "type": "uint16",
      "internalType": "uint16"
     },
     {
      "name": "domain",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "attestation",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "payloadURI",
      "type": "string",
      "internalType": "string"
     },
     {
      "name": "bloom",
      "type": "bytes",
      "internalType": "bytes"
     }
    ]
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "currentPrice",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "currentUpfront",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "dispute",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "getClaim",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct VerityMarket.Claim",
    "components": [
     {
      "name": "seller",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "status",
      "type": "uint8",
      "internalType": "enum VerityMarket.Status"
     },
     {
      "name": "proposed",
      "type": "uint8",
      "internalType": "enum VerityMarket.Outcome"
     },
     {
      "name": "outcome",
      "type": "uint8",
      "internalType": "enum VerityMarket.Outcome"
     },
     {
      "name": "confidenceBps",
      "type": "uint16",
      "internalType": "uint16"
     },
     {
      "name": "buyerCount",
      "type": "uint8",
      "internalType": "uint8"
     },
     {
      "name": "committedAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "deadline",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "exclusivityEnd",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "publishedAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "proposedAt",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "upfront",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "contingent",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "bond",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "contingentEscrow",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "claimHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "payloadHash",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "resolverId",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "domain",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "proposer",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "disputer",
      "type": "address",
      "internalType": "address"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "getSellerRecord",
  "inputs": [
   {
    "name": "seller",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct VerityMarket.SellerRecord",
    "components": [
     {
      "name": "commits",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "settled",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "resolvedTrue",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "resolvedFalse",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "fabricated",
      "type": "uint32",
      "internalType": "uint32"
     },
     {
      "name": "bondsPosted",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "bondsSlashed",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "earned",
      "type": "uint128",
      "internalType": "uint128"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "isPublic",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "markPublished",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "evidenceURI",
    "type": "string",
    "internalType": "string"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "oracles",
  "inputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "owner",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "paidUpfront",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "pool",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "propose",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "outcome",
    "type": "uint8",
    "internalType": "enum VerityMarket.Outcome"
   },
   {
    "name": "evidenceURI",
    "type": "string",
    "internalType": "string"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "proposerBond",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "purchase",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "purchaseFor",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "buyer",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "uint128",
    "internalType": "uint128"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "purchased",
  "inputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "renounceOwnership",
  "inputs": [],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "resolveDispute",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "outcome",
    "type": "uint8",
    "internalType": "enum VerityMarket.Outcome"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "resolvers",
  "inputs": [
   {
    "name": "",
    "type": "bytes32",
    "internalType": "bytes32"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "setOracle",
  "inputs": [
   {
    "name": "who",
    "type": "address",
    "internalType": "address"
   },
   {
    "name": "allowed",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setPool",
  "inputs": [
   {
    "name": "pool_",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "setResolver",
  "inputs": [
   {
    "name": "id",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "allowed",
    "type": "bool",
    "internalType": "bool"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "settle",
  "inputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "transferOwnership",
  "inputs": [
   {
    "name": "newOwner",
    "type": "address",
    "internalType": "address"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "usdc",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IERC20"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "event",
  "name": "Committed",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "seller",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "claimHash",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "payloadHash",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "resolverId",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "domain",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "deadline",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   },
   {
    "name": "exclusivityEnd",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   },
   {
    "name": "upfront",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "contingent",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "bond",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "confidenceBps",
    "type": "uint16",
    "indexed": false,
    "internalType": "uint16"
   },
   {
    "name": "payloadURI",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "bloom",
    "type": "bytes",
    "indexed": false,
    "internalType": "bytes"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "DisputeResolved",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "outcome",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum VerityMarket.Outcome"
   },
   {
    "name": "winner",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "bondsAwarded",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Disputed",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "disputer",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "OracleSet",
  "inputs": [
   {
    "name": "oracle",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "allowed",
    "type": "bool",
    "indexed": false,
    "internalType": "bool"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "OwnershipTransferred",
  "inputs": [
   {
    "name": "previousOwner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "newOwner",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Proposed",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "proposer",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "outcome",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum VerityMarket.Outcome"
   },
   {
    "name": "evidenceURI",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Published",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "evidenceURI",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   },
   {
    "name": "publishedAt",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Purchased",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "buyer",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "payer",
    "type": "address",
    "indexed": false,
    "internalType": "address"
   },
   {
    "name": "upfrontPaid",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "contingentEscrowed",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "ResolverSet",
  "inputs": [
   {
    "name": "resolverId",
    "type": "bytes32",
    "indexed": true,
    "internalType": "bytes32"
   },
   {
    "name": "allowed",
    "type": "bool",
    "indexed": false,
    "internalType": "bool"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Settled",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "outcome",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum VerityMarket.Outcome"
   },
   {
    "name": "publicByDeadline",
    "type": "bool",
    "indexed": false,
    "internalType": "bool"
   },
   {
    "name": "contingentToSeller",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "contingentToPool",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "contingentRefunded",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "bondReturned",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "bondSlashed",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "slashToBuyers",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "slashToPool",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "Slashed",
  "inputs": [
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "seller",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "outcome",
    "type": "uint8",
    "indexed": false,
    "internalType": "enum VerityMarket.Outcome"
   },
   {
    "name": "amount",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "toBuyers",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "toPool",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "AlreadyPurchased",
  "inputs": []
 },
 {
  "type": "error",
  "name": "BadParams",
  "inputs": []
 },
 {
  "type": "error",
  "name": "NotWhitelisted",
  "inputs": []
 },
 {
  "type": "error",
  "name": "OwnableInvalidOwner",
  "inputs": [
   {
    "name": "owner",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "OwnableUnauthorizedAccount",
  "inputs": [
   {
    "name": "account",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "ReentrancyGuardReentrantCall",
  "inputs": []
 },
 {
  "type": "error",
  "name": "SafeERC20FailedOperation",
  "inputs": [
   {
    "name": "token",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "TooEarly",
  "inputs": []
 },
 {
  "type": "error",
  "name": "TooLate",
  "inputs": []
 },
 {
  "type": "error",
  "name": "Unauthorized",
  "inputs": []
 },
 {
  "type": "error",
  "name": "WrongStatus",
  "inputs": []
 }
] as const;

export const bidsAbi = [
 {
  "type": "constructor",
  "inputs": [
   {
    "name": "market_",
    "type": "address",
    "internalType": "contract VerityMarket"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "bidCount",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "cancelBid",
  "inputs": [
   {
    "name": "bidId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "fillBid",
  "inputs": [
   {
    "name": "bidId",
    "type": "uint256",
    "internalType": "uint256"
   },
   {
    "name": "claimId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "getBid",
  "inputs": [
   {
    "name": "bidId",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "outputs": [
   {
    "name": "",
    "type": "tuple",
    "internalType": "struct StandingBids.Bid",
    "components": [
     {
      "name": "bidder",
      "type": "address",
      "internalType": "address"
     },
     {
      "name": "amount",
      "type": "uint128",
      "internalType": "uint128"
     },
     {
      "name": "expiry",
      "type": "uint64",
      "internalType": "uint64"
     },
     {
      "name": "maxBrierBps",
      "type": "uint16",
      "internalType": "uint16"
     },
     {
      "name": "open",
      "type": "bool",
      "internalType": "bool"
     },
     {
      "name": "domain",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "resolverId",
      "type": "bytes32",
      "internalType": "bytes32"
     },
     {
      "name": "criteria",
      "type": "string",
      "internalType": "string"
     }
    ]
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "market",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract VerityMarket"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "function",
  "name": "postBid",
  "inputs": [
   {
    "name": "domain",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "resolverId",
    "type": "bytes32",
    "internalType": "bytes32"
   },
   {
    "name": "criteria",
    "type": "string",
    "internalType": "string"
   },
   {
    "name": "amount",
    "type": "uint128",
    "internalType": "uint128"
   },
   {
    "name": "maxBrierBps",
    "type": "uint16",
    "internalType": "uint16"
   },
   {
    "name": "expiry",
    "type": "uint64",
    "internalType": "uint64"
   }
  ],
  "outputs": [
   {
    "name": "id",
    "type": "uint256",
    "internalType": "uint256"
   }
  ],
  "stateMutability": "nonpayable"
 },
 {
  "type": "function",
  "name": "usdc",
  "inputs": [],
  "outputs": [
   {
    "name": "",
    "type": "address",
    "internalType": "contract IERC20"
   }
  ],
  "stateMutability": "view"
 },
 {
  "type": "event",
  "name": "BidCancelled",
  "inputs": [
   {
    "name": "bidId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "refunded",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "BidFilled",
  "inputs": [
   {
    "name": "bidId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "claimId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "seller",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "paid",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "refunded",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   }
  ],
  "anonymous": false
 },
 {
  "type": "event",
  "name": "BidPosted",
  "inputs": [
   {
    "name": "bidId",
    "type": "uint256",
    "indexed": true,
    "internalType": "uint256"
   },
   {
    "name": "bidder",
    "type": "address",
    "indexed": true,
    "internalType": "address"
   },
   {
    "name": "domain",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "resolverId",
    "type": "bytes32",
    "indexed": false,
    "internalType": "bytes32"
   },
   {
    "name": "amount",
    "type": "uint128",
    "indexed": false,
    "internalType": "uint128"
   },
   {
    "name": "maxBrierBps",
    "type": "uint16",
    "indexed": false,
    "internalType": "uint16"
   },
   {
    "name": "expiry",
    "type": "uint64",
    "indexed": false,
    "internalType": "uint64"
   },
   {
    "name": "criteria",
    "type": "string",
    "indexed": false,
    "internalType": "string"
   }
  ],
  "anonymous": false
 },
 {
  "type": "error",
  "name": "BadBid",
  "inputs": []
 },
 {
  "type": "error",
  "name": "ReentrancyGuardReentrantCall",
  "inputs": []
 },
 {
  "type": "error",
  "name": "SafeERC20FailedOperation",
  "inputs": [
   {
    "name": "token",
    "type": "address",
    "internalType": "address"
   }
  ]
 },
 {
  "type": "error",
  "name": "Unauthorized",
  "inputs": []
 }
] as const;

export const erc20Abi = [{"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"s","type":"address"},{"name":"a","type":"uint256"}],"outputs":[{"type":"bool"}]},{"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"to","type":"address"},{"name":"a","type":"uint256"}],"outputs":[{"type":"bool"}]},{"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"o","type":"address"}],"outputs":[{"type":"uint256"}]},{"type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"o","type":"address"},{"name":"s","type":"address"}],"outputs":[{"type":"uint256"}]}] as const;
