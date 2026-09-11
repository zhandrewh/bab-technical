import type { FeedEvent } from "@/lib/events";
import { usd } from "@/lib/chain";
import { Panel, Rule, TxLink } from "./ui";

const OUT = ["NONE", "TRUE", "FALSE", "FABRICATED"];

export function SettlementTable({ e, slashed }: { e: FeedEvent; slashed?: FeedEvent }) {
  const a = e.args as Record<string, string | boolean>;
  const o = OUT[Number(a.outcome)];
  const $ = (k: string) => usd(BigInt(a[k] as string));
  const rows: [string, string, string][] = [
    ["contingent → seller", $("contingentToSeller"), "true and public by deadline"],
    ["contingent → public-goods pool", $("contingentToPool"), "true but suppressed — never refunded"],
    ["contingent → refunded to buyers", $("contingentRefunded"), "false or fabricated"],
    ["bond → returned to seller", $("bondReturned"), ""],
    ["bond → slashed", $("bondSlashed"), o === "FABRICATED" ? "100%" : o === "FALSE" ? "50%" : ""],
    ["  slash → buyers", $("slashToBuyers"), ""],
    ["  slash → pool", $("slashToPool"), ""],
  ];
  return (
    <Panel tone={o === "TRUE" ? "gold" : "danger"}>
      <Rule left={`settled ${o}`} tone={o === "TRUE" ? "gold" : "danger"} right={<TxLink hash={e.tx} label="settle tx" />} />
      <div className="mt-2 text-[12px] text-muted-foreground">public by deadline: {a.publicByDeadline ? "yes" : "no"}</div>
      <table className="mt-3 w-full text-[13px]">
        <tbody className="divide-y divide-border/50">
          {rows.map(([k, v, n]) => (
            <tr key={k}>
              <td className="py-1.5 whitespace-pre text-gold-dim">{k}</td>
              <td className={`py-1.5 text-right ${k.includes("slash") && v !== "$0.00" ? "text-danger" : ""}`}>{v}</td>
              <td className="py-1.5 pl-3 text-[11px] text-muted-foreground">{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {slashed && <div className="mt-3 text-[11px] uppercase tracking-widest text-danger">[slash] bond burned on chain · <TxLink hash={slashed.tx} /></div>}
    </Panel>
  );
}
