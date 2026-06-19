import { useState, useEffect, useCallback, useRef } from "react";
import { getResults, getClaimTimeline } from "../api/client";
import Spinner from "../components/Spinner";

const fmtAmt = (v) =>
  v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

// ── Result meta ──────────────────────────────────────────────────────────────
const RESULT_META = {
  MATCHED:                { label: "Matched",                color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", icon: "✓" },
  SETTLEMENT_PENDING:     { label: "Settlement Pending",    color: "#b45309", bg: "#fffbeb", border: "#fde68a", icon: "◷" },
  STATUS_MISMATCH:        { label: "Status Mismatch",       color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: "≠" },
  INVESTIGATION_REQUIRED: { label: "Investigation Required",color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", icon: "⚠" },
  AMOUNT_MISMATCH:        { label: "Amount Mismatch",       color: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", icon: "≠" },
  NOT_SENT:               { label: "Not Sent",              color: "#475569", bg: "#f8fafc", border: "#e2e8f0", icon: "—" },
};

const STATUS_META = {
  SUCCESS:         { color: "#16a34a", bg: "#f0fdf4" },
  PARTIAL_SUCCESS: { color: "#6d28d9", bg: "#f5f3ff" },
  FAILED:          { color: "#dc2626", bg: "#fef2f2" },
};

const FILTERS = [
  { key: "all",                   label: "All" },
  { key: "MATCHED",               label: "Matched" },
  { key: "SETTLEMENT_PENDING",    label: "Pending" },
  { key: "STATUS_MISMATCH",       label: "Status Mismatch" },
  { key: "INVESTIGATION_REQUIRED",label: "Investigation" },
  { key: "AMOUNT_MISMATCH",       label: "Amount Mismatch" },
  { key: "NOT_SENT",              label: "Not Sent" },
];

// ── Claim Timeline drawer ────────────────────────────────────────────────────
const TLINE_META = {
  FHIR_SYNCED:       { title: "Claim Synced from FHIR",   icon: "⊞", color: "#1d4ed8" },
  BATCH_CREATED:     { title: "Added to Batch",            icon: "▤", color: "#1d4ed8" },
  GATEWAY_SUBMITTED: { title: "Submitted to NCHL Gateway", icon: "▶", color: "#7c3aed" },
  GATEWAY_ACCEPTED:  { title: "Accepted by NCHL",          icon: "✓", color: "#16a34a" },
  GATEWAY_FAILED:    { title: "Rejected by NCHL",          icon: "✗", color: "#dc2626" },
  SOSYS_LOGGED:      { title: "Logged in SOSYS",           icon: "⊟", color: "#0e7490" },
  RECONCILED:        { title: "Reconciled",                icon: "⬡", color: "#16a34a" },
};

function TimelineDrawer({ claimId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getClaimTimeline(claimId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [claimId]);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 900 }}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0,
        width: "min(540px, 100vw)",
        background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,.12)",
        display: "flex", flexDirection: "column",
        zIndex: 901,
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-raised)",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)" }}>
              Claim Audit Trail
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginTop: 2, fontFamily: "monospace" }}>
              {claimId}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 10px", borderRadius: 5,
              border: "1px solid var(--border)", background: "#fff",
              fontSize: 16, color: "var(--text-muted)", cursor: "pointer",
            }}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading && <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><Spinner /></div>}
          {!loading && !data && (
            <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 32, fontSize: 13 }}>
              No timeline data available
            </div>
          )}
          {!loading && data && (
            <>
              {/* Claim summary */}
              <div style={{
                padding: "12px 14px", borderRadius: 6,
                background: "var(--surface-raised)", border: "1px solid var(--border)",
                marginBottom: 22, fontSize: 12,
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                  <div><span style={{ color: "var(--text-muted)" }}>Patient: </span><strong>{data.patient_name || "—"}</strong></div>
                  <div><span style={{ color: "var(--text-muted)" }}>Provider: </span><strong>{data.provider || "—"}</strong></div>
                  <div><span style={{ color: "var(--text-muted)" }}>Amount: </span><strong style={{ fontFamily: "monospace" }}>NPR {fmtAmt(data.amount)}</strong></div>
                  <div><span style={{ color: "var(--text-muted)" }}>Status: </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px",
                      padding: "2px 7px", borderRadius: 3,
                      background: "#f0fdf4", color: "#16a34a",
                    }}>{data.current_status || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div style={{ position: "relative", paddingLeft: 24 }}>
                <div style={{
                  position: "absolute", left: 8, top: 8, bottom: 8,
                  width: 1, background: "var(--border)",
                }} />

                {(data.events || []).map((ev, i) => {
                  const m = TLINE_META[ev.event] || { title: ev.event, icon: "·", color: "#9ca3af" };
                  const isOk      = ev.status === "ok";
                  const isWarning = ev.status === "warning";
                  const isError   = ev.status === "error";
                  const dotColor  = isOk ? "#16a34a" : isWarning ? "#d97706" : isError ? "#dc2626" : "#9ca3af";

                  return (
                    <div key={i} style={{ position: "relative", marginBottom: 18 }}>
                      <div style={{
                        position: "absolute", left: -20, top: 6,
                        width: 9, height: 9, borderRadius: "50%",
                        background: dotColor,
                        border: "2px solid #fff",
                        boxShadow: `0 0 0 1.5px ${dotColor}44`,
                      }} />
                      <div style={{
                        padding: "10px 12px", borderRadius: 6,
                        border: `1px solid ${isError ? "var(--red-border)" : isWarning ? "var(--amber-border)" : "var(--border-subtle)"}`,
                        background: isError ? "var(--red-bg)" : isWarning ? "var(--amber-bg)" : "#fff",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, color: m.color }}>{m.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{ev.title || m.title}</span>
                          </div>
                          <span style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                            {fmtDate(ev.ts)}
                          </span>
                        </div>
                        {ev.detail && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{ev.detail}</div>
                        )}
                        {ev.meta && Object.keys(ev.meta).length > 0 && (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                            {Object.entries(ev.meta).map(([k, v]) => (
                              <span key={k} style={{ fontSize: 10, color: "var(--text-faint)" }}>
                                <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>{k}:</span> {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ReconciliationWorkbench() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("all");
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(25);
  const [sortCol, setSortCol]     = useState("created_at");
  const [sortDir, setSortDir]     = useState("desc");
  const [timelineId, setTimelineId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await getResults();
      setData(r);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  // Filter + search
  const rows = (data || []).filter(r => {
    if (filter !== "all" && r.result !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        String(r.claim_id).includes(q) ||
        (r.reason || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Sort
  const sorted = [...rows].sort((a, b) => {
    const va = a[sortCol] ?? "";
    const vb = b[sortCol] ?? "";
    const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const counts = (data || []).reduce((acc, r) => {
    acc[r.result] = (acc[r.result] || 0) + 1;
    return acc;
  }, {});

  const handleSort = (col) => {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }) => {
    if (col !== sortCol) return <span style={{ opacity: .25 }}>↕</span>;
    return <span style={{ color: "var(--primary)" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const TH = ({ label, col, align = "left" }) => (
    <th
      onClick={col ? () => handleSort(col) : undefined}
      style={{
        padding: "9px 12px",
        textAlign: align,
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".5px",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-raised)",
        whiteSpace: "nowrap",
        cursor: col ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {label} {col && <SortIcon col={col} />}
    </th>
  );

  return (
    <div style={{ padding: "22px 28px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 4 }}>
            Reconciliation
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
            Reconciliation Workbench
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            NCHL gateway responses matched against SOSYS payment confirmations
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

      {/* Summary tiles */}
      {data && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {FILTERS.slice(1).map(f => {
            const m = RESULT_META[f.key];
            const cnt = counts[f.key] || 0;
            if (!cnt) return null;
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => { setFilter(active ? "all" : f.key); setPage(1); }}
                style={{
                  padding: "6px 12px", borderRadius: 5,
                  border: `1px solid ${active ? m.border : "var(--border)"}`,
                  background: active ? m.bg : "#fff",
                  color: active ? m.color : "var(--text-muted)",
                  fontSize: 11, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 5,
                }}
              >
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{cnt}</span>
                {m.icon} {m.label}
              </button>
            );
          })}
        </div>
      )}

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
          placeholder="Search claim ID or reason…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            padding: "6px 10px", borderRadius: 5,
            border: "1px solid var(--border)", background: "#fff",
            fontSize: 12, outline: "none", width: 220,
          }}
        />
        <div style={{ height: 18, width: 1, background: "var(--border)" }} />
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            style={{
              padding: "4px 10px", borderRadius: 100,
              border: `1px solid ${filter === f.key ? "var(--primary)" : "var(--border)"}`,
              background: filter === f.key ? "var(--blue-bg)" : "#fff",
              color: filter === f.key ? "var(--primary)" : "var(--text-muted)",
              fontSize: 11, fontWeight: filter === f.key ? 700 : 500,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {f.label}
            {f.key !== "all" && counts[f.key] ? ` (${counts[f.key]})` : ""}
          </button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>
          {rows.length} record{rows.length !== 1 ? "s" : ""}
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
        {loading && !data ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : paged.length === 0 ? (
          <div style={{ padding: "48px 32px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>⊞</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>No records found</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Run a payment queue entry to generate reconciliation records</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <TH label="Claim ID"     col="claim_id" />
                    <TH label="Result"       col="result" />
                    <TH label="NCHL Status"  align="center" />
                    <TH label="NCHL Amt"     col="gateway_amount" align="right" />
                    <TH label="SOSYS Status" align="center" />
                    <TH label="SOSYS Amt"    col="bank_amount" align="right" />
                    <TH label="Variance"     align="right" />
                    <TH label="Reason" />
                    <TH label="Reconciled"   col="created_at" />
                    <TH label="Timeline" />
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r, i) => {
                    const rm = RESULT_META[r.result] || { label: r.result, color: "#64748b", bg: "#f8fafc", border: "#e2e8f0", icon: "" };
                    const gs = STATUS_META[r.gateway_status] || { color: "#64748b", bg: "#f8fafc" };
                    const bs = STATUS_META[r.bank_status]    || { color: "#64748b", bg: "#f8fafc" };
                    const variance = (r.gateway_amount != null && r.bank_amount != null)
                      ? Number(r.bank_amount) - Number(r.gateway_amount)
                      : null;
                    const isException = r.result !== "MATCHED" && r.result !== "SETTLEMENT_PENDING";

                    return (
                      <tr key={r.id} style={{
                        background: isException ? "#fffcfa" : i % 2 === 0 ? "#fff" : "#fafafa",
                      }}>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--primary)" }}>
                            {r.claim_id}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 8px", borderRadius: 3,
                            fontSize: 10, fontWeight: 700,
                            color: rm.color, background: rm.bg, border: `1px solid ${rm.border}`,
                          }}>
                            {rm.icon} {rm.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "center" }}>
                          {r.gateway_status ? (
                            <span style={{ padding: "2px 7px", borderRadius: 3, fontSize: 9, fontWeight: 700, color: gs.color, background: gs.bg }}>
                              {r.gateway_status}
                            </span>
                          ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>
                          {r.gateway_amount != null ? fmtAmt(r.gateway_amount) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "center" }}>
                          {r.bank_status ? (
                            <span style={{ padding: "2px 7px", borderRadius: 3, fontSize: 9, fontWeight: 700, color: bs.color, background: bs.bg }}>
                              {r.bank_status}
                            </span>
                          ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>
                          {r.bank_amount != null ? fmtAmt(r.bank_amount) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right" }}>
                          {variance === null ? (
                            <span style={{ color: "var(--text-faint)" }}>—</span>
                          ) : variance === 0 ? (
                            <span style={{ color: "#9ca3af", fontSize: 11 }}>Matched</span>
                          ) : (
                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: Math.abs(variance) > 0 ? "#dc2626" : "#d97706" }}>
                              {variance > 0 ? "+" : ""}{fmtAmt(variance)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", maxWidth: 200 }}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                            {r.reason || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", whiteSpace: "nowrap", fontSize: 11, color: "var(--text-muted)" }}>
                          {fmtDate(r.created_at)}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <button
                            onClick={() => setTimelineId(r.claim_id)}
                            style={{
                              padding: "3px 8px", borderRadius: 4,
                              border: "1px solid var(--border)", background: "#fff",
                              fontSize: 10, fontWeight: 600, color: "var(--text-muted)",
                              cursor: "pointer",
                            }}
                          >
                            Timeline →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px",
              borderTop: "1px solid var(--border)",
              background: "var(--surface-raised)",
              fontSize: 11,
            }}>
              <div style={{ color: "var(--text-muted)" }}>
                Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, sorted.length)} of {sorted.length}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  style={{ padding: "4px 6px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 11, background: "#fff" }}
                >
                  {[25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, opacity: page === 1 ? .4 : 1 }}
                >← Prev</button>
                <span style={{ color: "var(--text-muted)" }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, opacity: page === totalPages ? .4 : 1 }}
                >Next →</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Timeline drawer */}
      {timelineId && (
        <TimelineDrawer claimId={timelineId} onClose={() => setTimelineId(null)} />
      )}
    </div>
  );
}
