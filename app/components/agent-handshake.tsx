// The buy handshake as a sequence diagram: four participants, every hop labelled with the real HTTP status or contract
// call. Server-rendered SVG; nothing to hydrate.
const COLS = ["your agent", "verity api", "x402 facilitator", "VerityMarket"];
const X = [70, 250, 430, 610];
const STEPS: { from: number; to: number; label: string; tone?: "gold" | "danger" | "dim"; note?: string }[] = [
  { from: 0, to: 1, label: "GET /api/x402/claims?status=OPEN" },
  { from: 1, to: 0, label: "200 · n, k, odds, lift, bond, bloomFilter, price", tone: "dim" },
  { from: 0, to: 0, label: "decide locally: odds < 5%, lift ≥ 3×, watchlist overlap > 0", tone: "gold" },
  { from: 0, to: 1, label: "GET /claims/:id/buy" },
  { from: 1, to: 0, label: "402 Payment Required · accepts[] = currentPrice", tone: "danger" },
  { from: 0, to: 0, label: "sign EIP-3009 USDC authorization (no gas, no popup)", tone: "gold" },
  { from: 0, to: 1, label: "GET /claims/:id/buy + X-PAYMENT" },
  { from: 1, to: 2, label: "verify, settle" },
  { from: 2, to: 1, label: "USDC → relayer", tone: "dim" },
  { from: 1, to: 3, label: "purchaseFor(id, agent)" },
  { from: 3, to: 1, label: "upfront → seller · contingent → escrow · purchased[id][agent] = true", tone: "dim" },
  { from: 1, to: 0, label: "200 · purchaseTx", tone: "dim" },
  { from: 0, to: 1, label: "POST /api/key/:id  { address, signature, issuedAt }" },
  { from: 1, to: 3, label: "canDecrypt(id, agent)?" },
  { from: 3, to: 1, label: "true", tone: "dim" },
  { from: 1, to: 0, label: "200 · key   (the seller was never contacted)", tone: "dim" },
  { from: 0, to: 0, label: "decrypt · check payloadHash · check itemsRoot", tone: "gold" },
];
const TOP = 34, ROW = 30;

export function AgentHandshake() {
  const h = TOP + STEPS.length * ROW + 16;
  const color = (t?: string) => (t === "gold" ? "var(--gold)" : t === "danger" ? "var(--danger)" : t === "dim" ? "var(--muted-foreground)" : "var(--foreground)");
  return (
    <div className="bab-scroll overflow-x-auto">
      <svg viewBox={`0 0 680 ${h}`} className="min-w-[640px] w-full" role="img" aria-label="Sequence of the agent purchase: list, decide, 402, sign, pay, purchaseFor, key request, canDecrypt, decrypt and verify.">
        <defs>
          <marker id="arr" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L6 3 L0 6 z" fill="currentColor" />
          </marker>
        </defs>
        {COLS.map((c, i) => (
          <g key={c}>
            <line x1={X[i]} x2={X[i]} y1={TOP - 6} y2={h} stroke="var(--gold-faint)" strokeWidth={1} strokeDasharray={i === 0 ? undefined : "3 3"} />
            <rect x={X[i] - 58} y={2} width={116} height={22} rx={11} fill={i === 0 ? "var(--gold)" : "rgba(255,255,255,0.06)"} stroke={i === 0 ? "none" : "var(--gold-faint)"} />
            <text x={X[i]} y={17} textAnchor="middle" fontSize={11} fontWeight={500} fill={i === 0 ? "var(--background)" : "var(--foreground)"} fontFamily="var(--font-poppins)">
              {c}
            </text>
          </g>
        ))}
        {STEPS.map((s, i) => {
          const y = TOP + i * ROW + 14;
          const c = color(s.tone);
          if (s.from === s.to) {
            const x = X[s.from];
            return (
              <g key={i} color={c}>
                <path d={`M ${x} ${y - 8} h 14 v 14 h -14`} fill="none" stroke={c} strokeWidth={1.2} markerEnd="url(#arr)" />
                <text x={x + 22} y={y + 4} fontSize={10.5} fill={c} fontFamily="var(--font-dm-mono)">{s.label}</text>
              </g>
            );
          }
          const x1 = X[s.from], x2 = X[s.to];
          const dir = x2 > x1 ? 1 : -1;
          return (
            <g key={i} color={c}>
              <line x1={x1} x2={x2 - dir * 4} y1={y} y2={y} stroke={c} strokeWidth={1.2} markerEnd="url(#arr)" />
              <text x={(x1 + x2) / 2} y={y - 5} textAnchor="middle" fontSize={10.5} fill={c} fontFamily="var(--font-dm-mono)">{s.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
