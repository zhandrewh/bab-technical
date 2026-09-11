import type { Metadata } from "next";
import Link from "next/link";
import { HowFlow, type Step } from "@/components/how-flow";

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
          A seller reads public court dockets and notices a pattern: a handful of sealed fraud cases the government looks about to settle.
          They write down which cases, encrypt the list, and post a claim on chain: “3 of these 12 cases will get a Justice Department
          announcement by October 11.”
        </p>
        <p>
          To post it they must put up a bond in USDC. The contract also records a fingerprint of the list, so the seller can never quietly
          change which cases they meant.
        </p>
      </>
    ),
    example: (
      <>
        Bond posted: <span className="text-gold">$1.25</span>. Headline written by the contract, not the seller: “3 of 12 sealed cases…”. The
        seller&apos;s machine can switch off now; it is not needed again.
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
          Before paying, you see the headline, the deadline, the bond, the price, and the institution whose public announcements will decide it.
          You also see two numbers that matter more than a star rating: how often a random guess would make the same claim, and how this
          seller&apos;s past baskets performed against that baseline.
        </p>
        <p>What you cannot see is the list itself. That is the product.</p>
      </>
    ),
    example: (
      <>
        A random dozen sealed cases would make this claim about <span className="text-gold">0.1%</span> of the time. If the seller has been right
        seven times more often than chance, the listing says <span className="text-gold">7× lift</span>.
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
          The price is split in two. The upfront part goes to the seller the moment you buy. The larger, contingent part goes into escrow
          inside the contract, where neither of you can touch it.
        </p>
        <p>A person buys with a wallet. A program buys with a single HTTP request that carries the payment. Both land in the same place.</p>
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
    heading: "The key comes from the contract, not the seller.",
    body: (
      <>
        <p>
          When the seller sealed the list, they locked the key to a release service that answers one question only: does the contract say
          this address may read this claim? After you buy, the answer is yes, and the key is handed over. The seller is never asked.
        </p>
        <p>
          Each claim has an exclusivity window, fixed at the moment of sealing. When it ends, the answer becomes yes for everyone. Findings
          here are early, never permanently private.
        </p>
      </>
    ),
    example: (
      <>
        You decrypt in your own browser and check two fingerprints: the encrypted file matches what was committed, and every case on the list
        matches the sealed root. If either fails, the seller has already lost.
      </>
    ),
  },
  {
    id: "decide",
    label: "Decide",
    heading: "An institution that does not know about the bet settles it.",
    body: (
      <>
        <p>
          The claim resolves against a public list the seller cannot influence: the Justice Department&apos;s own press releases. A checker
          reads them, counts which sealed cases were named, and proposes an outcome on chain, posting a bond of their own.
        </p>
        <p>
          Then a challenge window opens. Anyone who thinks the checker is wrong can dispute by matching the bond. Disputes go to a backstop
          that rules on the evidence, and the losing side forfeits its bond.
        </p>
      </>
    ),
    example: <>The checker also verifies that every cited docket entry exists. A made-up citation is not “false”; it is fabrication, and it is treated much worse.</>,
  },
  {
    id: "settle",
    label: "Settle",
    heading: "Money moves according to what happened.",
    body: (
      <>
        <p>
          <span className="text-gold">True</span>, and public before the deadline: the escrow goes to the seller and their bond comes back. True but
          kept quiet past the deadline: the escrow goes to a public-goods pool, never back to a buyer who sat on it.
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
        On the fabricated basket in the ledger, the buyer got back <span className="text-gold">$1.20</span> of escrow and was repaid their{" "}
        <span className="text-gold">$0.30</span> upfront out of the bond. The seller lost the whole <span className="text-danger">$2.10</span>.
      </>
    ),
  },
  {
    id: "record",
    label: "Record",
    heading: "Every outcome becomes part of the seller's name.",
    body: (
      <>
        <p>
          Settlement writes to the seller&apos;s permanent record: how many items they committed, how many hit, how honest their stated
          confidence was, and how much bond they have lost. The next listing shows all of it before anyone pays.
        </p>
        <p>There is no way to buy a better record. There is only being right, in public, over time.</p>
      </>
    ),
  },
];

export default function HowPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-2xl space-y-3">
        <h1 className="font-serif text-[40px] leading-none text-foreground sm:text-[52px]">How verity works</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          A market for findings you cannot inspect before paying. Seven steps, in plain words. The chart keeps pace as you read; the{" "}
          <Link href="/ledger" className="text-gold hover:underline">ledger</Link> shows each step as a real transaction.
        </p>
      </header>
      <HowFlow steps={STEPS} />
    </div>
  );
}
