const BOX_W = 160;
const BOX_H = 52;

function Box({ x, y, label, sub, color = "#2563eb", light = "#dbeafe" }) {
  return (
    <g>
      <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={8} fill={light} stroke={color} strokeWidth={1.5} />
      <text x={x + BOX_W / 2} y={y + BOX_H / 2 - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill={color}>{label}</text>
      {sub && <text x={x + BOX_W / 2} y={y + BOX_H / 2 + 11} textAnchor="middle" fontSize={11} fill={color} opacity={.75}>{sub}</text>}
    </g>
  );
}

function Arrow({ x1, y1, x2, y2, label }) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker id="arr" markerWidth={8} markerHeight={8} refX={6} refY={3} orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#64748b" />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arr)" />
      {label && <text x={mx + 6} y={my - 4} fontSize={11} fill="#64748b">{label}</text>}
    </g>
  );
}

function ResultBadge({ x, y, label, color, bg }) {
  return (
    <g>
      <rect x={x} y={y} width={148} height={28} rx={6} fill={bg} stroke={color} strokeWidth={1} />
      <text x={x + 74} y={y + 18} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>{label}</text>
    </g>
  );
}

export default function FlowPage() {
  return (
    <div style={{ padding: "28px 32px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>System Flow</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
        End-to-end flow from OpenIMIS claims to reconciliation outcome.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* SVG flow diagram */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, boxShadow: "var(--shadow)", overflowX: "auto" }}>
          <svg width={820} height={520} style={{ display: "block", margin: "0 auto" }}>
            {/* Column 1: OpenIMIS */}
            <Box x={40}  y={10}  label="OpenIMIS" sub="Approved Claims" color="#0891b2" light="#e0f2fe" />
            <Arrow x1={120} y1={62} x2={120} y2={92} />
            <Box x={40}  y={92}  label="Claim Service" sub="MockClaimRepository" color="#0891b2" light="#e0f2fe" />
            <Arrow x1={200} y1={118} x2={290} y2={118} label="claim IDs + amounts" />

            {/* Column 2: Batch */}
            <Box x={290} y={92}  label="Payment Batch" sub="payment_batches" color="#7c3aed" light="#ede9fe" />
            <Arrow x1={370} y1={144} x2={370} y2={178} />
            <Box x={290} y={178} label="NCHL Gateway" sub="POST /batch-submit" color="#7c3aed" light="#ede9fe" />
            <Arrow x1={370} y1={230} x2={370} y2={258} />
            <Box x={290} y={258} label="SOSYS Log" sub="sosys_payment_logs" color="#7c3aed" light="#ede9fe" />

            {/* Column 3: Bank */}
            <Box x={540} y={178} label="Bank Statement" sub="CSV / PDF upload" color="#0f766e" light="#ccfbf1" />
            <Arrow x1={620} y1={230} x2={620} y2={258} />
            <Box x={540} y={258} label="Bank Rows" sub="bank_statement_rows" color="#0f766e" light="#ccfbf1" />

            {/* Arrows to engine */}
            <Arrow x1={370} y1={310} x2={430} y2={370} />
            <Arrow x1={620} y1={310} x2={560} y2={370} />

            {/* Reconciliation Engine */}
            <rect x={340} y={370} width={220} height={56} rx={8} fill="#fef3c7" stroke="#d97706" strokeWidth={2} />
            <text x={450} y={398} textAnchor="middle" fontSize={14} fontWeight={700} fill="#92400e">Reconciliation</text>
            <text x={450} y={416} textAnchor="middle" fontSize={11} fill="#b45309">Engine</text>

            {/* Result arrows */}
            <Arrow x1={340} y1={426} x2={240} y2={456} />
            <Arrow x1={450} y1={426} x2={450} y2={456} />
            <Arrow x1={560} y1={426} x2={660} y2={456} />

            {/* Results */}
            <ResultBadge x={82}  y={456} label="MATCHED" color="#16a34a" bg="#dcfce7" />
            <ResultBadge x={376} y={456} label="SETTLEMENT PENDING" color="#b45309" bg="#fef3c7" />
            <ResultBadge x={622} y={456} label="STATUS MISMATCH" color="#dc2626" bg="#fee2e2" />

            {/* Source of truth label */}
            <rect x={530} y={150} width={130} height={24} rx={4} fill="#fee2e2" stroke="#dc2626" strokeWidth={1} strokeDasharray="4,2" />
            <text x={595} y={166} textAnchor="middle" fontSize={11} fontWeight={700} fill="#dc2626">Source of Truth ★</text>
            <Arrow x1={595} y1={174} x2={595} y2={178} />
          </svg>
        </div>

        {/* Rules table */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 14 }}>
            Reconciliation Rules
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Gateway Status", "Bank Status", "Condition", "Result", "Action"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["SUCCESS", "SUCCESS", "Amounts match", "MATCHED", "No action needed"],
                ["SUCCESS", "SUCCESS", "Amounts differ", "AMOUNT_MISMATCH", "Contact bank to verify settlement"],
                ["SUCCESS", "NOT FOUND", "—", "SETTLEMENT_PENDING", "Wait for next bank statement"],
                ["SUCCESS", "FAILED", "—", "STATUS_MISMATCH", "Investigate with bank"],
                ["FAILED", "SUCCESS", "—", "INVESTIGATION_REQUIRED", "Freeze — risk of double payment"],
                ["NOT FOUND", "any", "—", "NOT_SENT", "Re-submit claim to gateway"],
              ].map(([gw, bank, cond, result, action], i) => {
                const colors = {
                  MATCHED: { c: "#16a34a", b: "#dcfce7" },
                  AMOUNT_MISMATCH: { c: "#7c3aed", b: "#ede9fe" },
                  SETTLEMENT_PENDING: { c: "#b45309", b: "#fef3c7" },
                  STATUS_MISMATCH: { c: "#dc2626", b: "#fee2e2" },
                  INVESTIGATION_REQUIRED: { c: "#ea580c", b: "#ffedd5" },
                  NOT_SENT: { c: "#475569", b: "#f1f5f9" },
                };
                const s = colors[result];
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600, color: gw === "SUCCESS" ? "var(--green)" : gw === "FAILED" ? "var(--red)" : "var(--gray)" }}>{gw}</td>
                    <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", fontWeight: 600, color: bank === "SUCCESS" ? "var(--green)" : bank === "FAILED" ? "var(--red)" : "var(--gray)" }}>{bank}</td>
                    <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>{cond}</td>
                    <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: s.c, background: s.b }}>{result.replace(/_/g, " ")}</span>
                    </td>
                    <td style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>{action}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
