import { useState } from "react";
import { getResults } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import Spinner from "../components/Spinner";
import Pagination from "../components/Pagination";

const fmt = (v) => v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const RESULT_META = {
  MATCHED:                { color: "#16a34a", bg: "#dcfce7", label: "Matched",               icon: "✓" },
  SETTLEMENT_PENDING:     { color: "#b45309", bg: "#fef3c7", label: "Settlement Pending",    icon: "◷" },
  STATUS_MISMATCH:        { color: "#dc2626", bg: "#fee2e2", label: "Status Mismatch",       icon: "✗" },
  INVESTIGATION_REQUIRED: { color: "#ea580c", bg: "#ffedd5", label: "Investigation Required",icon: "⚠" },
  AMOUNT_MISMATCH:        { color: "#7c3aed", bg: "#ede9fe", label: "Amount Mismatch",       icon: "≠" },
  NOT_SENT:               { color: "#475569", bg: "#f1f5f9", label: "Not Sent",              icon: "—" },
};

const STATUS_META = {
  SUCCESS:        { color: "#16a34a", bg: "#dcfce7" },
  PARTIAL_SUCCESS:{ color: "#7c3aed", bg: "#ede9fe" },
  FAILED:         { color: "#dc2626", bg: "#fee2e2" },
};

function ResultBadge({ value }) {
  const m = RESULT_META[value] || { color: "#475569", bg: "#f1f5f9", label: value, icon: "" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
      borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
      color: m.color, background: m.bg,
    }}>
      {m.icon} {m.label}
    </span>
  );
}

function StatusChip({ value }) {
  const s = STATUS_META[value] || { color: "#64748b", bg: "#f1f5f9" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, color: s.color, background: s.bg }}>
      {value || "—"}
    </span>
  );
}

function AmountDiff({ gateway, sosys }) {
  if (gateway == null || sosys == null) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const diff = Number(sosys) - Number(gateway);
  if (diff === 0) return <span style={{ color: "#64748b", fontSize: 11 }}>Matched</span>;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: diff > 0 ? "#d97706" : "#dc2626" }}>
      {diff > 0 ? "+" : ""}{fmt(diff)}
    </span>
  );
}

const ALL_FILTERS = ["All", "MATCHED", "SETTLEMENT_PENDING", "STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"];

export default function ResultsPage() {
  const { data, loading, error, reload } = useFetch(getResults);
  const [filter, setFilter]  = useState("All");
  const [search, setSearch]  = useState("");
  const [page, setPage]      = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useAutoRefresh(reload, 15000);

  const rows = (data || []).filter(r => {
    if (filter !== "All" && r.result !== filter) return false;
    if (search && !String(r.claim_id).includes(search)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  // Summary counts
  const counts = (data || []).reduce((acc, r) => {
    acc[r.result] = (acc[r.result] || 0) + 1;
    return acc;
  }, {});
  const total = data?.length || 0;

  function setFilterReset(f) { setFilter(f); setPage(1); }
  function setSearchReset(v) { setSearch(v); setPage(1); }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: "var(--text)" }}>
          Reconciliation Results
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Every claim reconciled by comparing NCHL gateway response with SOSYS payment confirmation.
        </p>
      </div>

      {/* Summary cards */}
      {total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
          {Object.entries(RESULT_META).map(([key, m]) => {
            const cnt = counts[key] || 0;
            if (cnt === 0 && key !== "MATCHED") return null;
            return (
              <button key={key} onClick={() => setFilterReset(filter === key ? "All" : key)}
                style={{
                  padding: "12px 14px", borderRadius: 10, border: `1.5px solid ${filter === key ? m.color : "var(--border)"}`,
                  background: filter === key ? m.bg : "var(--surface)",
                  cursor: "pointer", textAlign: "left", boxShadow: "var(--shadow)", transition: "transform .1s",
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                onMouseLeave={e => e.currentTarget.style.transform = ""}
              >
                <div style={{ fontSize: 22, fontWeight: 800, color: m.color }}>{cnt}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: m.color, marginTop: 2 }}>{m.label}</div>
              </button>
            );
          })}
        </div>
      )}

      {loading && !data && <div style={{ padding: 48, textAlign: "center" }}><Spinner /></div>}
      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", marginBottom: 16, fontSize: 13 }}>
          Error: {error}
        </div>
      )}

      {data && (
        <>
          {/* Filter bar */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
            <input
              type="text" placeholder="Search claim ID…"
              value={search} onChange={e => setSearchReset(e.target.value)}
              style={{
                padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)",
                fontSize: 13, outline: "none", width: 170,
                boxShadow: "inset 0 1px 2px rgba(0,0,0,.04)",
              }}
            />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ALL_FILTERS.map(f => {
                const m = RESULT_META[f];
                return (
                  <button key={f} onClick={() => setFilterReset(f)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, border: "1.5px solid",
                      borderColor: filter === f ? (m?.color || "var(--primary)") : "var(--border)",
                      background: filter === f ? (m?.bg || "var(--blue-bg)") : "var(--surface)",
                      color: filter === f ? (m?.color || "var(--primary)") : "var(--text-muted)",
                      fontWeight: filter === f ? 700 : 500, fontSize: 11, cursor: "pointer",
                    }}>
                    {f === "All" ? `All (${total})` : (m?.label || f.replace(/_/g, " "))}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <div style={{
              padding: "12px 18px", borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: "#f8fafc",
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                {rows.length} record{rows.length !== 1 ? "s" : ""}
                {filter !== "All" && ` · filtered by ${RESULT_META[filter]?.label || filter}`}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                NCHL = payment gateway · SOSYS = confirmation system
              </span>
            </div>

            {paged.length === 0 ? (
              <div style={{ padding: "56px 32px", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⚖</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No reconciliation records</div>
                <div style={{ fontSize: 13 }}>
                  Execute a payment queue entry to generate reconciliation records automatically.
                </div>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      { label: "Claim ID",        align: "left"   },
                      { label: "Result",           align: "left"   },
                      { label: "NCHL Status",      align: "center" },
                      { label: "NCHL Amount",      align: "right"  },
                      { label: "SOSYS Status",     align: "center" },
                      { label: "SOSYS Amount",     align: "right"  },
                      { label: "Variance",         align: "right"  },
                      { label: "Reason",           align: "left"   },
                      { label: "Reconciled At",    align: "left"   },
                    ].map(h => (
                      <th key={h.label} style={{
                        padding: "10px 14px", textAlign: h.align,
                        borderBottom: "1px solid var(--border)",
                        fontWeight: 700, fontSize: 10, textTransform: "uppercase",
                        letterSpacing: ".5px", color: "var(--text-muted)", whiteSpace: "nowrap",
                      }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>
                        {r.claim_id}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                        <ResultBadge value={r.result} />
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                        <StatusChip value={r.gateway_status} />
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>
                        {fmt(r.gateway_amount)}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                        <StatusChip value={r.bank_status} />
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", fontWeight: 600, fontFamily: "monospace", fontSize: 12 }}>
                        {fmt(r.bank_amount)}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                        <AmountDiff gateway={r.gateway_amount} sosys={r.bank_amount} />
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", maxWidth: 220 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>{r.reason || "—"}</span>
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {r.created_at ? new Date(r.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Pagination
              page={page} totalPages={totalPages} total={rows.length} pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
            />
          </div>
        </>
      )}
    </div>
  );
}
