import { useState, useEffect, useCallback } from "react";
import { getFailed, retryBatch } from "../api/client";
import Spinner from "../components/Spinner";

const fmtAmt = (v) =>
  v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtDate = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const FAIL_META = {
  FAILED:                { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Gateway Failed" },
  STATUS_MISMATCH:       { color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", label: "Status Mismatch" },
  AMOUNT_MISMATCH:       { color: "#6d28d9", bg: "#f5f3ff", border: "#ddd6fe", label: "Amount Mismatch" },
  INVESTIGATION_REQUIRED:{ color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Investigation Required" },
  NOT_SENT:              { color: "#475569", bg: "#f8fafc", border: "#e2e8f0", label: "Not Sent" },
};

export default function FailedPaymentsCenter() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [retrying, setRetrying] = useState({});
  const [retryMsg, setRetryMsg] = useState(null);
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const PAGE_SIZE = 30;

  const load = useCallback(async () => {
    try {
      const r = await getFailed();
      setData(r);
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (batchId) => {
    if (!batchId) return;
    setRetrying(r => ({ ...r, [batchId]: true }));
    try {
      await retryBatch(batchId);
      setRetryMsg({ type: "success", text: `Batch ${batchId} queued for retry.` });
      await load();
    } catch (e) {
      setRetryMsg({ type: "error", text: e?.response?.data?.detail || "Retry failed" });
    } finally {
      setRetrying(r => ({ ...r, [batchId]: false }));
    }
  };

  const rows = (data || []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(r.claim_id || "").includes(q) ||
      (r.reason || "").toLowerCase().includes(q) ||
      (r.gateway_status || "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{ padding: "22px 28px", maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 4 }}>
            Failed Payments
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
            Failed Payments Center
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            Claims where payment failed at the NCHL gateway or reconciliation produced an error
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
      {retryMsg && (
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginBottom: 14, fontSize: 12,
          background: retryMsg.type === "success" ? "var(--green-bg)" : "var(--red-bg)",
          border: `1px solid ${retryMsg.type === "success" ? "var(--green-border)" : "var(--red-border)"}`,
          color: retryMsg.type === "success" ? "var(--green)" : "var(--red)",
        }}>
          {retryMsg.text}
          <button
            onClick={() => setRetryMsg(null)}
            style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "inherit" }}
          >×</button>
        </div>
      )}

      {/* Summary row */}
      {data && (
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          <div style={{
            padding: "12px 16px", borderRadius: 6, background: "#fff",
            border: "1px solid var(--red-border)", borderTop: "3px solid #dc2626",
            minWidth: 120,
          }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#dc2626" }}>{data.length}</div>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginTop: 4 }}>
              Total Failed
            </div>
          </div>
          <div style={{
            padding: "12px 16px", borderRadius: 6, background: "#fff",
            border: "1px solid var(--amber-border)", borderTop: "3px solid #d97706",
            flex: 1,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>
              Failure breakdown
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {Object.entries(
                data.reduce((acc, r) => {
                  const key = r.recon_result || r.gateway_status || "UNKNOWN";
                  acc[key] = (acc[key] || 0) + 1;
                  return acc;
                }, {})
              ).map(([k, v]) => {
                const m = FAIL_META[k] || { color: "#64748b", bg: "#f8fafc", border: "#e2e8f0", label: k };
                return (
                  <span key={k} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 9px", borderRadius: 4,
                    fontSize: 11, fontWeight: 600,
                    color: m.color, background: m.bg, border: `1px solid ${m.border}`,
                  }}>
                    <span style={{ fontWeight: 800 }}>{v}</span> {m.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", background: "var(--surface-raised)",
        border: "1px solid var(--border)", borderRadius: "6px 6px 0 0", borderBottom: "none",
      }}>
        <input
          type="text"
          placeholder="Search claim ID or reason…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            padding: "6px 10px", borderRadius: 5,
            border: "1px solid var(--border)", background: "#fff",
            fontSize: 12, outline: "none", width: 240,
          }}
        />
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-faint)" }}>
          {rows.length} record{rows.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: "#fff", border: "1px solid var(--border)",
        borderRadius: "0 0 8px 8px", overflow: "hidden", boxShadow: "var(--shadow-xs)",
      }}>
        {loading ? (
          <div style={{ padding: 40, display: "flex", justifyContent: "center" }}><Spinner /></div>
        ) : paged.length === 0 ? (
          <div style={{ padding: "48px 32px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: .4 }}>✓</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>No failed payments</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>All processed payments have succeeded</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--surface-raised)" }}>
                    {[
                      { label: "Claim ID",        align: "left"   },
                      { label: "Failure Type",    align: "left"   },
                      { label: "NCHL Status",     align: "center" },
                      { label: "NCHL Amount",     align: "right"  },
                      { label: "SOSYS Status",    align: "center" },
                      { label: "Variance",        align: "right"  },
                      { label: "Reason",          align: "left"   },
                      { label: "Detected",        align: "left"   },
                      { label: "Action",          align: "center" },
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
                  {paged.map((r, i) => {
                    const failKey = r.recon_result || r.gateway_status || "FAILED";
                    const fm = FAIL_META[failKey] || FAIL_META.FAILED;
                    const variance = (r.gateway_amount != null && r.bank_amount != null)
                      ? Number(r.bank_amount) - Number(r.gateway_amount) : null;

                    return (
                      <tr key={r.claim_id || i} style={{ background: i % 2 === 0 ? "#fff" : "#fffcfc" }}>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--primary)" }}>
                            {r.claim_id}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 7px", borderRadius: 3,
                            fontSize: 10, fontWeight: 700,
                            color: fm.color, background: fm.bg, border: `1px solid ${fm.border}`,
                          }}>
                            {fm.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "center" }}>
                          <span style={{
                            padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700,
                            background: "#fef2f2", color: "#dc2626",
                          }}>
                            {r.gateway_status || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right", fontFamily: "monospace", fontSize: 11 }}>
                          {r.gateway_amount != null ? Number(r.gateway_amount).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "center" }}>
                          <span style={{
                            padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 700,
                            background: "#f8fafc", color: "#475569",
                          }}>
                            {r.bank_status || "—"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right" }}>
                          {variance === null ? <span style={{ color: "var(--text-faint)" }}>—</span>
                            : variance === 0 ? <span style={{ color: "#9ca3af", fontSize: 11 }}>Matched</span>
                            : <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: "#dc2626" }}>
                                {variance > 0 ? "+" : ""}{fmtAmt(variance)}
                              </span>}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", maxWidth: 200 }}>
                          <span style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>{r.reason || "—"}</span>
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {fmtDate(r.created_at)}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border-subtle)", textAlign: "center" }}>
                          {r.batch_id ? (
                            <button
                              onClick={() => handleRetry(r.batch_id)}
                              disabled={retrying[r.batch_id]}
                              style={{
                                padding: "4px 10px", borderRadius: 4,
                                border: "1px solid var(--red-border)",
                                background: "var(--red-bg)", color: "var(--red)",
                                fontSize: 10, fontWeight: 700, cursor: "pointer",
                                opacity: retrying[r.batch_id] ? .6 : 1,
                              }}
                            >
                              {retrying[r.batch_id] ? "…" : "↻ Retry"}
                            </button>
                          ) : (
                            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>No batch</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", borderTop: "1px solid var(--border)",
                background: "var(--surface-raised)", fontSize: 11,
              }}>
                <div style={{ color: "var(--text-muted)" }}>
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, opacity: page === 1 ? .4 : 1 }}>
                    ← Prev
                  </button>
                  <span style={{ color: "var(--text-muted)" }}>{page} / {totalPages}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ padding: "4px 10px", borderRadius: 4, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontSize: 11, opacity: page === totalPages ? .4 : 1 }}>
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
