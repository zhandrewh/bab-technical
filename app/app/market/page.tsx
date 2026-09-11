import { loadMarket } from "@/lib/claims";
import { MarketTable } from "@/components/market-table";
import { Rule, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Market() {
  let claims: Awaited<ReturnType<typeof loadMarket>>["claims"] = [];
  let error = "";
  try {
    claims = (await loadMarket()).claims;
  } catch (e) {
    error = (e as Error).message;
  }
  return (
    <div className="space-y-6">
      <Rule left="market" right={`${claims.filter((c) => c.status === "OPEN").length} open · ${claims.length} total`} />
      <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
        Every row is sealed. You see what a buyer can know before paying: the institution that can prove the claim wrong, the deadline,
        how the seller split the price, how much they bonded, and how well calibrated they have been. The content stays encrypted until you buy
        or the exclusivity window ends.
      </p>
      {error && <Panel tone="danger"><span className="text-[11px] uppercase tracking-widest text-danger">[error]</span> <span className="text-[13px]">{error}</span></Panel>}
      <MarketTable claims={claims} />
    </div>
  );
}
