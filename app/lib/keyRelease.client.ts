// Client-safe half of the key-release protocol (no server imports).
import { MARKET, chain } from "./chain";

export const keyRequestMessage = (claimId: bigint, issuedAt: number) =>
  `Verity key request\nchain:${chain.id}\nmarket:${MARKET.toLowerCase()}\nclaim:${claimId}\nissuedAt:${issuedAt}`;
