import { useState, useEffect } from "react";
import { getBatches, getBatchDetail, autoCreateBatches, enqueueBatches } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import Spinner from "../components/Spinner";
import Pagination from "../components/Pagination";

const fmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS_META = {
  PENDING:   { bg: "#eff6ff", color: "#2563eb", dot: "#3b82f6", label: "Pending" },
  SUBMITTED: { bg: "#fef9c3", color: "#854d0e", dot: "#eab308", label: "Submitted" },
  COMPLETED: { bg: "#dcfce7", color: "#166534", dot: "#16a34a", label: "Completed" },
  PARTIAL:   { bg: "#fff7ed", color: "#9a3412", dot: "#f97316", label: "Partial" },
  FAILED:    { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626", label: "Failed" },
};

const PAY_STATUS_META = {
  DONE:    { color: "#16a34a", bg: "#dcfce7" },
  PENDING: { color: "#b45309", bg: "#fef3c7" },
  ERROR:   { color: "#dc2626", bg: "#fee2e2" },
};

function StatusPill({ status }) {
  const s = STATUS_META[status] || { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
      {s.label || status}
    </span>
  );
}

function PayBadge({ status }) {
  const s = PAY_STATUS_META[status] || { color: "#64748b", bg: "#f1f5f9" };
  return (
    <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 700, color: s.color, background: s.bg }}>
      {status}
    </span>
  );
}

// ── Batch Detail Modal ─────────────────────────────────────────────────────────
function BatchDetailModal({ batchId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    getBatchDetail(batchId)
      .then(setDetail)
      .catch(e => setErr(e?.response?.data?.error || "Failed to load"))
      .finally(() => setLoading(false));
  }, [batchId]);

  const bMeta = detail ? (STATUS_META[detail.status] || {}) : {};

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 720,
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 25px 80px rgba(0,0,0,.3)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 17, fontWeight: 800, fontFamily: "monospace", color: "var(--primary)" }}>
                {detail?.batch_number || "Loading…"}
              </span>
              {detail && <StatusPill status={detail.status} />}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {detail?.hospital_name} · {detail?.claim_count} claim{detail?.claim_count !== 1 ? "s" : ""} · {fmt(detail?.total_amount)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)", lineHeight: 1 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner /></div>}
          {err && <div style={{ color: "var(--red)", padding: 20 }}>Error: {err}</div>}

          {detail && !detail.can_resubmit && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 14,
              background: "#fef9c3", border: "1px solid #eab308",
              color: "#854d0e", fontSize: 12, fontWeight: 500, display: "flex", gap: 8, alignItems: "center",
            }}>
              <span style={{ fontSize: 16 }}>🔒</span>
              This batch has been <strong>{detail.status}</strong> — it cannot be re-submitted to prevent duplicate payments.
            </div>
          )}

          {detail?.claims && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Claim ID", "Patient", "Amount", "Gateway Status", "Payment Status", "Recon Result"].map(h => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: "left", borderBottom: "1px solid var(--border)",
                      fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--text-muted)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.claims.map((c, i) => (
                  <tr key={c.claim_id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>
                      {c.claim_id}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                      {c.patient_name || <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
                      {fmt(c.amount)}
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                        color: c.gateway_status === "SUCCESS" ? "#16a34a" : c.gateway_status === "FAILED" ? "#dc2626" : "#64748b",
                        background: c.gateway_status === "SUCCESS" ? "#dcfce7" : c.gateway_status === "FAILED" ? "#fee2e2" : "#f1f5f9",
                      }}>
                        {c.gateway_status}
                      </span>
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                      <PayBadge status={c.payment_status} />
                    </td>
                    <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
                      {c.recon_result
                        ? <span style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic" }}>{c.recon_result.replace(/_/g, " ")}</span>
                        : <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 22px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Schedule Modal ─────────────────────────────────────────────────────────────
function ScheduleModal({ selected, batches, onClose, onDone }) {
  const selectedBatches = batches.filter(b => selected.has(b.id));
  const blocked = selectedBatches.filter(b => b.status === "SUBMITTED" || b.status === "COMPLETED");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 5);
    return d.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  const total      = selectedBatches.reduce((s, b) => s + Number(b.total_amount), 0);
  const claimCount = selectedBatches.reduce((s, b) => s + b.claim_count, 0);

  async function handle() {
    setLoading(true);
    try {
      const ids = [...selected];
      const res = await enqueueBatches(ids, new Date(scheduledAt).toISOString());
      setResult({ ok: true, text: `${res.queued} batch(es) added to payment queue.` });
      onDone();
    } catch (e) {
      setResult({ ok: false, text: e?.response?.data?.error || "Failed to enqueue" });
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: 500, boxShadow: "0 25px 80px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Schedule Payment</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {selectedBatches.length} batch(es) · {claimCount} claims · {fmt(total)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {blocked.length > 0 && (
            <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, background: "#fee2e2", color: "#991b1b", fontSize: 12, fontWeight: 500 }}>
              🔒 {blocked.length} batch(es) are already {blocked[0].status} and will be skipped to prevent duplicate payments.
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            {selectedBatches.map(b => {
              const isBlocked = b.status === "SUBMITTED" || b.status === "COMPLETED";
              return (
                <div key={b.id} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "9px 12px", borderRadius: 8,
                  background: isBlocked ? "#f8fafc" : "#f0f9ff",
                  border: `1px solid ${isBlocked ? "#e2e8f0" : "#bfdbfe"}`,
                  marginBottom: 6, fontSize: 13, opacity: isBlocked ? 0.6 : 1,
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11, color: "var(--primary)" }}>{b.batch_number}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{b.hospital_name}</div>
                  </div>
                  <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={{ fontWeight: 600 }}>{fmt(b.total_amount)}</span>
                    {isBlocked ? <StatusPill status={b.status} /> : <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{b.claim_count} claims</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 700, display: "block", marginBottom: 6, color: "var(--text-muted)" }}>
              Scheduled date &amp; time
            </label>
            <input
              type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--primary)", fontSize: 13, width: "100%", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
              Background scheduler runs every 60s and picks up due entries automatically.
            </p>
          </div>

          {result && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 500,
              background: result.ok ? "var(--green-bg)" : "var(--red-bg)",
              color: result.ok ? "var(--green)" : "var(--red)",
            }}>
              {result.ok ? `✓ ${result.text}` : `✗ ${result.text}`}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
              {result?.ok ? "Done" : "Cancel"}
            </button>
            {!result?.ok && (
              <button onClick={handle} disabled={loading}
                style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: loading ? "#93c5fd" : "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Scheduling…" : "Add to Queue →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function BatchesPage() {
  const { data, loading, error, reload } = useFetch(getBatches);
  const [lastRefresh, setLastRefresh]    = useState(new Date());
  const [selected, setSelected]          = useState(new Set());
  const [showSchedule, setShowSchedule]  = useState(false);
  const [detailId, setDetailId]          = useState(null);
  const [autoCreating, setAutoCreating]  = useState(false);
  const [autoResult, setAutoResult]      = useState(null);
  const [batchSize, setBatchSize]        = useState(15);
  const [filterStatus, setFilterStatus]  = useState("");
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useAutoRefresh(() => { reload(); setLastRefresh(new Date()); }, 15000);

  const batches    = data?.batches || [];
  const filtered   = filterStatus ? batches.filter(b => b.status === filterStatus) : batches;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows   = filtered.slice((page - 1) * pageSize, page * pageSize);

  const summary = batches.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const selectedBatches = batches.filter(b => selected.has(b.id));
  const selectedTotal   = selectedBatches.reduce((s, b) => s + Number(b.total_amount), 0);
  const schedulableCount = selectedBatches.filter(b => b.status === "PENDING").length;

  function toggleAll() {
    setSelected(selected.size === pageRows.length ? new Set() : new Set(pageRows.map(b => b.id)));
  }
  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleAutoCreate() {
    setAutoCreating(true); setAutoResult(null);
    try {
      const res = await autoCreateBatches(batchSize, false);
      setAutoResult({
        ok: true,
        text: res.total_batches === 0
          ? "All claims already batched — nothing new to create."
          : `Created ${res.total_batches} batch(es) from unbatched claims.`,
      });
      reload(); setLastRefresh(new Date());
    } catch (e) {
      setAutoResult({ ok: false, text: e?.response?.data?.error || "Auto-create failed" });
    } finally { setAutoCreating(false); }
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, color: "var(--text)" }}>Payment Batches</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Claims grouped by hospital, chunked into batches, then scheduled for NCHL payment.
          </p>
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            Updated {lastRefresh.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Stats row */}
      {batches.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
          {Object.entries(summary).map(([st, cnt]) => {
            const s = STATUS_META[st] || { bg: "#f1f5f9", color: "#64748b", dot: "#94a3b8" };
            return (
              <button key={st} onClick={() => setFilterStatus(filterStatus === st ? "" : st)}
                style={{
                  padding: "12px 14px", borderRadius: 10,
                  background: filterStatus === st ? s.bg : "var(--surface)",
                  border: `1.5px solid ${filterStatus === st ? s.color : "var(--border)"}`,
                  color: s.color, cursor: "pointer", textAlign: "left",
                  boxShadow: "var(--shadow)",
                }}>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{cnt}</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{s.label || st}</div>
              </button>
            );
          })}
          {filterStatus && (
            <button onClick={() => setFilterStatus("")}
              style={{ padding: "12px 14px", borderRadius: 10, border: "1px dashed var(--border)", background: "var(--surface)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}>
              Clear filter ✕
            </button>
          )}
        </div>
      )}

      {/* Auto-create panel */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
        boxShadow: "var(--shadow)", padding: "18px 22px", marginBottom: 18,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Auto-Create from Unbatched Claims</div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              Groups all unbatched FHIR claims by hospital and creates <strong>PENDING</strong> batches ready for scheduling.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>Per batch:</span>
              {[5, 10, 15, 25, 50].map(n => (
                <button key={n} onClick={() => setBatchSize(n)}
                  style={{
                    padding: "4px 11px", borderRadius: 6,
                    border: `2px solid ${batchSize === n ? "var(--primary)" : "var(--border)"}`,
                    background: batchSize === n ? "var(--blue-bg)" : "transparent",
                    color: batchSize === n ? "var(--primary)" : "var(--text-muted)",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>{n}</button>
              ))}
              <input
                type="number" min="1" max="500" value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
                style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, textAlign: "center" }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>claims</span>
            </div>
          </div>
          <button onClick={handleAutoCreate} disabled={autoCreating}
            style={{
              background: autoCreating ? "#93c5fd" : "var(--primary)", color: "#fff",
              border: "none", borderRadius: 8, padding: "10px 22px", alignSelf: "flex-end",
              fontWeight: 700, fontSize: 13, cursor: autoCreating ? "not-allowed" : "pointer",
              boxShadow: "var(--shadow-md)",
            }}>
            {autoCreating ? "Creating…" : "⟳ Auto-Create"}
          </button>
        </div>
        {autoResult && (
          <div style={{
            marginTop: 12, padding: "9px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: autoResult.ok ? "var(--green-bg)" : "var(--red-bg)",
            color: autoResult.ok ? "var(--green)" : "var(--red)",
          }}>
            {autoResult.ok ? `✓ ${autoResult.text}` : `✗ ${autoResult.text}`}
          </div>
        )}
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          background: "#f0f9ff", border: "1.5px solid #bfdbfe", borderRadius: 10,
          padding: "12px 16px", marginBottom: 14,
        }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--primary)" }}>
              {selected.size} selected
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 8 }}>
              {fmt(selectedTotal)} total
            </span>
            {schedulableCount < selected.size && (
              <span style={{ fontSize: 11, color: "#b45309", marginLeft: 10, fontWeight: 600 }}>
                ({selected.size - schedulableCount} already submitted/completed — will be blocked)
              </span>
            )}
          </div>
          <button onClick={() => setShowSchedule(true)}
            style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Schedule Payment →
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}

      {loading && !data && <Spinner />}
      {error && (
        <div style={{ padding: "14px 16px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontSize: 13, marginBottom: 14 }}>
          Error: {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "64px 32px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No batches yet</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Use Auto-Create above to group FHIR claims by hospital.</div>
          </div>
        ) : (
          <>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                {filtered.length} batch{filtered.length !== 1 ? "es" : ""}
                {filterStatus && ` · filtered by ${filterStatus}`}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Click a row to see claims</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", width: 36 }}>
                    <input type="checkbox" checked={selected.size === pageRows.length && pageRows.length > 0} onChange={toggleAll} />
                  </th>
                  {["Batch Number", "Hospital", "Claims", "Total Amount", "Status", "Queue", "Created"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)",
                      fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((b, i) => {
                  const isDone = b.status === "SUBMITTED" || b.status === "COMPLETED";
                  return (
                    <tr key={b.id}
                      onClick={() => setDetailId(b.id)}
                      style={{
                        background: selected.has(b.id) ? "#eff6ff" : i % 2 === 0 ? "#fff" : "#fafafa",
                        cursor: "pointer",
                        borderLeft: selected.has(b.id) ? "3px solid var(--primary)" : "3px solid transparent",
                        transition: "background .1s",
                      }}
                      onMouseEnter={e => { if (!selected.has(b.id)) e.currentTarget.style.background = "#f0f9ff"; }}
                      onMouseLeave={e => { if (!selected.has(b.id)) e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafafa"; }}
                    >
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}
                        onClick={e => { e.stopPropagation(); toggle(b.id); }}>
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 11, color: "var(--primary)" }}>{b.batch_number}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 1 }}>#{b.id}</div>
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{b.hospital_name || "—"}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{b.hospital_id}</div>
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{b.claim_count}</span>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>claims</div>
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>
                        {fmt(b.total_amount)}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                        <StatusPill status={b.status} />
                        {isDone && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>🔒 cannot resubmit</div>}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                        {b.in_queue
                          ? <span style={{ fontSize: 11, fontWeight: 700, color: "#16a34a" }}>● Queued</span>
                          : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(b.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              page={page} totalPages={totalPages} total={filtered.length} pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
            />
          </>
        )}
      </div>

      {detailId && <BatchDetailModal batchId={detailId} onClose={() => setDetailId(null)} />}
      {showSchedule && (
        <ScheduleModal
          selected={selected} batches={batches}
          onClose={() => setShowSchedule(false)}
          onDone={() => { reload(); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
