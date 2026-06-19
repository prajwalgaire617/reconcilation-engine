import { useState, useEffect, useCallback } from "react";
import { getExceptions } from "../api/client";
import Spinner from "../components/Spinner";

const fmtAmt = (v) =>
  v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const SEVERITY_META = {
  CRITICAL: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#dc2626" },
  HIGH:     { color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", dot: "#ea580c" },
  MEDIUM:   { color: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#d97706" },
  LOW:      { color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
};

const EXCEPTION_META = {
  INVESTIGATION_REQUIRED: {
    label: "Investigation Required",
    severity: "CRITICAL",
    desc: "Manual investigation by finance team needed",
  },
  STATUS_MISMATCH: {
    label: "Status Mismatch",
    severity: "HIGH",
    desc: "NCHL and SOSYS report different payment statuses",
  },
  AMOUNT_MISMATCH: {
    label: "Amount Mismatch",
    severity: "MEDIUM",
    desc: "Amounts differ between gateway and confirmation system",
  },
  NOT_SENT: {
    label: "Not Sent",
    severity: "MEDIUM",
    desc: "Claim was reconciled but no payment was submitted",
  },
  SETTLEMENT_PENDING: {
    label: "Settlement Pending",
    severity: "LOW",
    desc: "Payment sent, awaiting settlement confirmation",
  },
};

const TYPE_FILTERS = [
  { key: "",                      label: "All Exceptions" },
  { key: "INVESTIGATION_REQUIRED",label: "Investigation" },
  { key: "STATUS_MISMATCH",       label: "Status Mismatch" },
  { key: "AMOUNT_MISMATCH",       label: "Amount Mismatch" },
  { key: "NOT_SENT",              label: "Not Sent" },
  { key: "SETTLEMENT_PENDING",    label: "Settlement Pending" },
];

function SeverityBadge({ severity }) {
  const m = SEVERITY_META[severity] || SEVERITY_META.LOW;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 3,
      fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".4px",
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot }} />
      {severity}
    </span>
  );
}

export default function ExceptionManagement() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 30;

  const load = useCallback(async () => {
    try {
      const r = await getExceptions(typeFilter);
      setData(r);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleTypeFilter = (key) => {
    setTypeFilter(key);
    setPage(1);
  };

  const exceptions = (data?.exceptions || []).filter(ex => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(ex.claim_id || "").includes(q) ||
      (ex.provider || "").toLowerCase().includes(q) ||
      (ex.beneficiary || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(exceptions.length / PAGE_SIZE));
  const paged = exceptions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summary = data?.summary || {};
  const totalCount = data?.count || 0;

  return (
    <div style={{ padding: "22px 28px", maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 4 }}>
            Exception Management
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
            Reconciliation Exceptions
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            Claims flagged during reconciliation requiring investigation or action
          </div>
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

      {/* Exception type summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {Object.entries(EXCEPTION_META).map(([type, m]) => {
          const cnt = summary[type] || 0;
          const sm = SEVERITY_META[m.severity];
          const active = typeFilter === type;
          return (
            <button
              key={type}
              onClick={() => handleTypeFilter(active ? "" : type)}
              style={{
                padding: "12px 14px", borderRadius: 6,
                border: `1px solid ${active ? sm.border : "var(--border)"}`,
                borderTop: `3px solid ${sm.dot}`,
                background: active ? sm.bg : "#fff",
                cursor: "pointer", textAlign: "left",
                boxShadow: active ? `0 0 0 1px ${sm.border}` : "var(--shadow-xs)",
                transition: "all .1s",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: sm.color, letterSpacing: "-.02em" }}>{cnt}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: sm.color, marginTop: 3 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, lineHeight: 1.4 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "6px 6px 0 0",
        borderBottom: "none",
        flexWrap: "wrap",
      }}>
        <input
          type="text"
          placeholder="Search claim, provider, beneficiary…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            padding: "6px 10px", borderRadius: 5,
            border: "1px solid var(--border)", background: "#fff",
            fontSize: 12, outline: "none", width: 240,
          }}
        />
        <div style={{ height: 18, width: 1, background: "var(--border)" }} />
        {TYPE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => handleTypeFilter(f.key)}
            style={{
              padding: "4px 10px", borderRadius: 100,
              border: `1px solid ${typeFilter === f.key ? "var(--primary)" : "var(--border)"}`,
              background: typeFilter === f.key ? "var(--blue-bg)" : "#fff",
              color: typeFilter === f.key ? "var(--primary)" : "var(--text-muted)",
              fontSize: 11, fontWeight: typeFilter === f.key ? 700 : 500,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {f.label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>
          {exceptions.length} exception{exceptions.length !== 1 ? "s" : ""}
          {typeFilter && ` · ${EXCEPTION_META[typeFilter]?.label || typeFilter}`}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "0 0 8px 8px",
        overflow: "hidden",
        boxShadow: "var(--shadow-xs)",
      }}>
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : paged.length === 0 ? (
          <div style={{ padding: "48px 32px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
              {typeFilter || search ? "No exceptions match your filter" : "No exceptions found"}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {!typeFilter && !search && "All reconciled claims have matched correctly"}
            </div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-raised)" }}>
                    {[
                      { label: "Severity",    align: "left"   },
                      { label: "Type",        align: "left"   },
                      { label: "Claim ID",    align: "left"   },
                      { label: "Provider",    align: "left"   },
                      { label: "Beneficiary", align: "left"   },
                      { label: "Amount",      align: "right"  },
                      { label: "Detected",    align: "left"   },
                    ].map(h => (
                      <th key={h.label} style={{
                        padding: "9px 12px", textAlign: h.align,
                        fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px",
                        color: "var(--text-muted)", borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}>{h.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((ex, i) => {
                    const sm = SEVERITY_META[ex.severity] || SEVERITY_META.LOW;
                    const tm = EXCEPTION_META[ex.exception_type] || { label: ex.exception_type, severity: "LOW" };

                    return (
                      <tr key={ex.claim_id || i} style={{
                        background: ex.severity === "CRITICAL" ? "#fffbfb" : i % 2 === 0 ? "#fff" : "#fafafa",
                      }}>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <SeverityBadge severity={ex.severity} />
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{
                            padding: "2px 7px", borderRadius: 3,
                            fontSize: 10, fontWeight: 600,
                            background: "var(--surface-raised)", color: "var(--text-secondary)",
                            border: "1px solid var(--border)",
                          }}>
                            {tm.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--primary)" }}>
                            {ex.claim_id}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                          {ex.provider || "—"}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}>
                          {ex.beneficiary || "—"}
                        </td>
                        <td style={{
                          padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)",
                          textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 600,
                        }}>
                          {fmtAmt(ex.amount)}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {fmtDate(ex.detected_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderTop: "1px solid var(--border)",
                background: "var(--surface-raised)", fontSize: 11,
              }}>
                <div style={{ color: "var(--text-muted)" }}>
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, exceptions.length)} of {exceptions.length}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, opacity: page === 1 ? .4 : 1 }}
                  >← Prev</button>
                  <span style={{ color: "var(--text-muted)" }}>{page} / {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, opacity: page === totalPages ? .4 : 1 }}
                  >Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
