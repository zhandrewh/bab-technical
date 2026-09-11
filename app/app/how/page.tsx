import type { Metadata } from "next";
import Link from "next/link";
import { HowFlow, type Step } from "@/components/how-flow";
import { TxLink } from "@/components/ui";

export const metadata: Metadata = { title: "how verity works", description: "Seven steps, in plain words, from a sealed finding to money moving on chain." };

// The worked example uses the reference seller's real pricing (scaled 1/1000 for testnet USDC): $1.78 total,
// 10% upfront, bond of 7x upfront.
const STEPS: Step[] = [
  {
    id: "seal",
    label: "Seal",
    heading: "Someone finds something before it is news.",
    body: (
      <>
        <p>
          A seller reads court dockets, SEC filings, FOIA requests, and other public records. They spend time searching for patterns, encrypt their findings, and post a claim on-chain.
                  </p>
        <p>
          To post it they must put up a bond in USDC.
        </p>
      </>
    ),
    example: (
      <>
        "3 of 12 sealed cases will get a Justice Department announcement by October 11."
      </>
    ),
  },
  {
    id: "look",
    label: "Look",
    heading: "You can inspect everything except the answer.",
    body: (
      <>
        <p>
          Before paying, sellers can inspect the headline, deadline, bond, price, and institution. The content cannot be accessed until payment is made.

        </p>
      </>
    ),
    example: (
      <>
        In the example of the sealed cases, the list of cases cannot be accessed until payment is made.
      </>
    ),
  },
  {
    id: "buy",
    label: "Buy blind",
    heading: "You pay a little now and promise the rest.",
    body: (
      <>
        <p>
          The price is split into an upfront and contingent part. The contingent part is locked in escrow until the deadline.
        </p>
      </>
    ),
    example: (
      <>
        You pay <span className="text-gold">$0.18</span> to the seller and <span className="text-gold">$1.60</span> into escrow. The upfront ask
        also falls over time, halving by the end of the exclusivity window, because leads go stale.
      </>
    ),
  },
  {
    id: "unlock",
    label: "Unlock",
    heading: "The key comes from the smart contract",
    body: (
      <>
        <p>
          When the seller posts the claim, they lock the key to the release service within the smart contract. 

          When you buy the claim, the key is released to your address without the seller needing to interact.
      
        </p>
        <p>
          Over time, the claim's exclusivity window expires and findings become public.
        </p>
      </>
    ),
    example: (
      <>
        You decrypt in your own browser and check two fingerprints: the encrypted file matches what was committed, and every case on the list
        matches the sealed root.
      </>
    ),
  },
  {
    id: "decide",
    label: "Decide",
    heading: "Verification",
    body: (
      <>
        <p>
          The claim resolves against a public list the seller cannot influence, (for this implementation), being the Justice Department&apos;s own press releases. 
        </p>
        <p>
          Then a challenge window opens. Anyone can challenge the claim by posting bond and providing evidence.
        </p>
      </>
    ),
    example: <>The checker also verifies that every cited docket entry exists. Made up postings are classified as "fabrications" and carry more consequences</>,
  },
  {
    id: "settle",
    label: "Settle",
    heading: "Money moves according to what happened.",
    body: (
      <>
        <p>
          <span className="text-gold">True</span>, and public before the deadline: the escrow goes to the seller and their bond comes back. True but
          kept quiet past the deadline: the escrow goes to a public-goods pool.
        </p>
        <p>
          <span className="text-danger">False</span>: buyers get the escrow back, and half the seller&apos;s bond is split between them and the pool.{" "}
          <span className="text-danger">Fabricated</span>: buyers get the escrow back, the whole bond is taken, and buyers are repaid their upfront
          before anything else.
        </p>
      </>
    ),
    example: (
      <>

        <TxLink hash="0x49a6518bdcb6739901ebfae8ccd64b4be40c9a9697bac2b2b3f28cbe90ccb549" label="See the settlement on-chain" />
      </>
    ),
  },
  {
    id: "record",
    label: "Record",
    heading: "Seller history",
    body: (
      <>
        <p>
          Everything writes to the seller's permanent record.
           </p>
        <p>This information is intended to be used by future buyers.</p>
      </>
    ),
  },
];

export default function HowPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-2xl space-y-3">
        <h1 className="font-serif text-[40px] leading-none text-foreground sm:text-[52px]">Workflow</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Verity is a market for findings that cannot be inspected before paying.
        </p>
      </header>
      <HowFlow steps={STEPS} />
    </div>
  );
}
