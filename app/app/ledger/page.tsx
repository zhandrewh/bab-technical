// Every transaction the market has ever made, drawn as a history graph. Built for the reader who wants to check, not
// be told: each node links to Basescan, and the four lenses map the graph onto what a reviewer grades.
import { privateKeyToAccount } from "viem/accounts";
import { loadMarket } from "@/lib/claims";
import { buildLedger, fmtUsd } from "@/lib/ledger";
import { MARKET, BIDS, addrUrl } from "@/lib/chain";
import { LedgerGraph } from "@/components/ledger-graph";
import { Rule, Stats, ErrorNote } from "@/components/ui";

export const dynamic = "force-dynamic";

function relayerAddress(): string | undefined {
  try {
    return process.env.RELAYER_PK ? privateKeyToAccount(process.env.RELAYER_PK as `0x${string}`).address : undefined;
  } catch {
    return undefined;
  }
}

export default async function LedgerPage() {
  let error = "";
  let ledger = buildLedger([]);
  try {
    const m = await loadMarket();
    ledger = buildLedger(m.events, m.claims, relayerAddress());
  } catch (e) {
    error = (e as Error).message;
  }
  const t = ledger.totals;
  const tiles: [string, string, string?][] = [
    ["Transactions", String(t.transactions)],
    ["Claims", `${t.claims}`, `${t.settled} settled · ${t.claims - t.settled} open`],
    ["Purchases", String(t.purchases)],
    ["Bonds posted", fmtUsd(t.bonded)],
    ["Held in escrow now", fmtUsd(t.escrowedNow), "contingent on open claims"],
    ["Paid to sellers", fmtUsd(t.toSellers), "upfront + released contingent"],
    ["Returned to buyers", fmtUsd(t.refunded + t.toBuyersFromSlash), "refunds + slashed bond"],
    ["To public-goods pool", fmtUsd(t.toPool), "suppressed findings + slash remainder"],
  ];

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Rule
          left="ledger"
          right={
            <>
              <a href={addrUrl(MARKET)} target="_blank" rel="noreferrer" className="hover:text-gold">VerityMarket ↗</a>
              <span className="mx-2">·</span>
              <a href={addrUrl(BIDS)} target="_blank" rel="noreferrer" className="hover:text-gold">StandingBids ↗</a>
            </>
          }
        />
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          The market as read from the Base Sepolia event log
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Stats big items={tiles} />

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border-2 border-gold" /> commit, proposal, publication</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-gold" /> purchase, settled true</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-danger" /> slash, settled false or fabricated, dispute</span>
        <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border border-dashed border-foreground" /> derived: no transaction</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-gold-faint" /> trunk: the contract</span>
      </div>

      <LedgerGraph rows={ledger.rows} spans={ledger.spans} lanes={ledger.lanes} />
    </div>
  );
}
