import { useState, useEffect, useCallback } from "react";
import { getDashboard, getResults } from "../api/client";
import Spinner from "../components/Spinner";

const fmtAmt = (v) =>
  v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const TODAY = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

const REPORT_TYPES = [
  { key: "daily_settlement",    label: "Daily Settlement",       desc: "Today's settlement summary by hospital" },
  { key: "reconciliation",      label: "Reconciliation Summary", desc: "Match rates and exception breakdown" },
  { key: "failed_payments",     label: "Failed Payments",        desc: "Failed and error claims detail" },
];

export default function ReportsPage() {
  const [summary, setSummary]     = useState(null);
  const [results, setResults]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeReport, setActive] = useState("daily_settlement");
  const [error, setError]         = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([getDashboard(0), getResults()]);
      setSummary(s);
      setResults(r);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived stats from results
  const resultCounts = (results || []).reduce((acc, r) => {
    acc[r.result] = (acc[r.result] || 0) + 1;
    return acc;
  }, {});
  const totalRecon  = results?.length || 0;
  const matched     = resultCounts["MATCHED"] || 0;
  const exceptions  = totalRecon - matched;
  const matchRate   = totalRecon > 0 ? ((matched / totalRecon) * 100).toFixed(1) : "—";

  const failedRows = (results || []).filter(r =>
    ["STATUS_MISMATCH", "AMOUNT_MISMATCH", "INVESTIGATION_REQUIRED", "NOT_SENT"].includes(r.result)
  );

  return (
    <div style={{ padding: "22px 28px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 4 }}>
            Reports
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
            Operational Reports
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{TODAY}</div>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 6,
            border: "1px solid var(--border)", background: "#fff",
            color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 6, marginBottom: 14, background: "var(--red-bg)", border: "1px solid var(--red-border)", color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 16, alignItems: "start" }}>
        {/* Report type sidebar */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)" }}>
              Report Type
            </div>
          </div>
          <div style={{ padding: "6px" }}>
            {REPORT_TYPES.map(rt => (
              <button
                key={rt.key}
                onClick={() => setActive(rt.key)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "9px 10px", borderRadius: 5, marginBottom: 2,
                  border: "none",
                  background: activeReport === rt.key ? "var(--blue-bg)" : "transparent",
                  color: activeReport === rt.key ? "var(--primary)" : "var(--text-secondary)",
                  fontWeight: activeReport === rt.key ? 700 : 500,
                  fontSize: 12, cursor: "pointer",
                }}
              >
                <div>{rt.label}</div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2, fontWeight: 400 }}>{rt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Report content */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
          {loading ? (
            <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Spinner /></div>
          ) : (
            <>
              {activeReport === "daily_settlement" && (
                <DailySettlementReport summary={summary} />
              )}
              {activeReport === "reconciliation" && (
                <ReconciliationReport
                  total={totalRecon} matched={matched}
                  exceptions={exceptions} matchRate={matchRate}
                  counts={resultCounts}
                />
              )}
              {activeReport === "failed_payments" && (
                <FailedPaymentsReport rows={failedRows} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Daily Settlement Report ──────────────────────────────────────────────────
function DailySettlementReport({ summary }) {
  if (!summary) return <EmptyState msg="No summary data" />;
  const s = summary;
  const rate = s.reconciliation_rate || 0;

  return (
    <>
      <ReportHeader title="Daily Settlement Report" subtitle={`Generated ${new Date().toLocaleTimeString()}`} />
      <div style={{ padding: "20px" }}>

        {/* Key figures */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Claims",        value: (s.total_claims || 0).toLocaleString(),         accent: "var(--primary)" },
            { label: "Total Amount",         value: fmtAmt(s.total_amount),                         accent: "#1d4ed8" },
            { label: "Reconciled",           value: (s.reconciled_claims || 0).toLocaleString(),    accent: "#16a34a" },
            { label: "Match Rate",           value: `${rate}%`,                                     accent: rate >= 90 ? "#16a34a" : "#dc2626" },
          ].map(t => (
            <div key={t.label} style={{
              padding: "12px 14px", borderRadius: 6,
              border: "1px solid var(--border)", borderTop: `3px solid ${t.accent}`,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>{t.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginTop: 4 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Status breakdown table */}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Payment Status Breakdown</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--surface-raised)" }}>
              {["Status", "Count", "Notes"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Reconciled (Matched)",   count: s.reconciled_claims,      note: "Successfully matched with SOSYS" },
              { label: "Pending Settlement",      count: s.pending_settlements,    note: "Awaiting SOSYS confirmation" },
              { label: "Failed Payments",         count: s.failed_payments,        note: "Gateway rejection or mismatch" },
              { label: "Amount Mismatches",       count: s.amount_mismatches,      note: "Variance between NCHL and SOSYS" },
              { label: "Retry Attempts",          count: s.retry_count,            note: "Re-submitted payment batches" },
            ].map((row, i) => (
              <tr key={row.label} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontWeight: 500 }}>{row.label}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontFamily: "monospace", fontWeight: 700 }}>{(row.count || 0).toLocaleString()}</td>
                <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontStyle: "italic" }}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Reconciliation Summary Report ────────────────────────────────────────────
function ReconciliationReport({ total, matched, exceptions, matchRate, counts }) {
  const RESULT_LABELS = {
    MATCHED:                "Matched",
    SETTLEMENT_PENDING:     "Settlement Pending",
    STATUS_MISMATCH:        "Status Mismatch",
    INVESTIGATION_REQUIRED: "Investigation Required",
    AMOUNT_MISMATCH:        "Amount Mismatch",
    NOT_SENT:               "Not Sent",
  };
  const RESULT_COLORS = {
    MATCHED:                "#16a34a",
    SETTLEMENT_PENDING:     "#b45309",
    STATUS_MISMATCH:        "#dc2626",
    INVESTIGATION_REQUIRED: "#c2410c",
    AMOUNT_MISMATCH:        "#6d28d9",
    NOT_SENT:               "#475569",
  };

  return (
    <>
      <ReportHeader title="Reconciliation Summary" subtitle={`${total} records · Match rate ${matchRate}%`} />
      <div style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Reconciled", value: total.toLocaleString(),   accent: "var(--primary)" },
            { label: "Matched",           value: matched.toLocaleString(), accent: "#16a34a"        },
            { label: "Exceptions",        value: exceptions.toLocaleString(), accent: "#dc2626"     },
          ].map(t => (
            <div key={t.label} style={{
              padding: "12px 14px", borderRadius: 6,
              border: "1px solid var(--border)", borderTop: `3px solid ${t.accent}`,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{t.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginTop: 4 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Match rate visual */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            <span style={{ color: "var(--text-muted)" }}>Match Rate</span>
            <span style={{ color: Number(matchRate) >= 90 ? "#16a34a" : "#dc2626" }}>{matchRate}%</span>
          </div>
          <div style={{ height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${matchRate}%`,
              background: Number(matchRate) >= 90 ? "#16a34a" : Number(matchRate) >= 70 ? "#d97706" : "#dc2626",
              borderRadius: 4,
              transition: "width .4s ease",
            }} />
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--surface-raised)" }}>
              {["Result Type", "Count", "% of Total"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(RESULT_LABELS).map(([key, label], i) => {
              const cnt = counts[key] || 0;
              const pct = total > 0 ? ((cnt / total) * 100).toFixed(1) : "0.0";
              return (
                <tr key={key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: RESULT_COLORS[key], flexShrink: 0 }} />
                      {label}
                    </span>
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontFamily: "monospace", fontWeight: 700 }}>{cnt.toLocaleString()}</td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Failed Payments Report ───────────────────────────────────────────────────
function FailedPaymentsReport({ rows }) {
  const RESULT_LABELS = {
    STATUS_MISMATCH:        "Status Mismatch",
    INVESTIGATION_REQUIRED: "Investigation Required",
    AMOUNT_MISMATCH:        "Amount Mismatch",
    NOT_SENT:               "Not Sent",
  };

  return (
    <>
      <ReportHeader title="Failed Payments Report" subtitle={`${rows.length} exception${rows.length !== 1 ? "s" : ""} requiring action`} />
      <div style={{ padding: "20px" }}>
        {rows.length === 0 ? (
          <EmptyState msg="No failed or exception payments" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "var(--surface-raised)" }}>
                {["Claim ID", "Exception Type", "NCHL Status", "SOSYS Status", "Reason", "Date"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id || i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--primary)" }}>
                    {r.claim_id}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, fontWeight: 600 }}>
                    {RESULT_LABELS[r.result] || r.result}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 10 }}>
                    {r.gateway_status || "—"}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 10 }}>
                    {r.bank_status || "—"}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)", fontStyle: "italic", fontSize: 11, maxWidth: 200 }}>
                    {r.reason || "—"}
                  </td>
                  <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function ReportHeader({ title, subtitle }) {
  return (
    <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-raised)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{subtitle}</div>}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>NHIF Nepal · Confidential</div>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div style={{ padding: "48px 32px", textAlign: "center", color: "var(--text-muted)" }}>
      <div style={{ fontSize: 24, marginBottom: 10, opacity: .4 }}>↗</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>{msg}</div>
    </div>
  );
}
