import { useState } from "react";
import { getBatches, autoCreateBatches, enqueueBatches } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import Spinner from "../components/Spinner";
import Pagination from "../components/Pagination";

const fmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS_STYLE = {
  PENDING:   { bg: "#eff6ff", color: "#2563eb" },
  SUBMITTED: { bg: "#fef3c7", color: "#b45309" },
  COMPLETED: { bg: "#dcfce7", color: "#16a34a" },
  PARTIAL:   { bg: "#fff7ed", color: "#c2410c" },
  FAILED:    { bg: "#fee2e2", color: "#dc2626" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || { bg: "#f1f5f9", color: "#64748b" };
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 20,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
    }}>{status}</span>
  );
}

// ── Schedule modal for selected batches ───────────────────────────────────────
function ScheduleModal({ selected, batches, onClose, onDone }) {
  const selectedBatches = batches.filter(b => selected.has(b.id));
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 5);
    return d.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  const total = selectedBatches.reduce((s, b) => s + Number(b.total_amount), 0);
  const claimCount = selectedBatches.reduce((s, b) => s + b.claim_count, 0);

  async function handle() {
    setLoading(true);
    try {
      const ids = [...selected];
      const res = await enqueueBatches(ids, new Date(scheduledAt).toISOString());
      setResult({ ok: true, text: `✓ ${res.queued} batch(es) added to payment queue.` });
      onDone();
    } catch (e) {
      setResult({ ok: false, text: e?.response?.data?.error || "Failed to enqueue" });
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, width: 480, boxShadow: "0 20px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Schedule Payment</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {selectedBatches.length} batch(es) · {claimCount} claims · {fmt(total)}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {/* Batch list preview */}
          <div style={{ marginBottom: 18 }}>
            {selectedBatches.map(b => (
              <div key={b.id} style={{
                display: "flex", justifyContent: "space-between",
                padding: "8px 12px", borderRadius: 7, background: "#f8fafc",
                border: "1px solid var(--border)", marginBottom: 6, fontSize: 13,
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontFamily: "monospace", fontSize: 11 }}>{b.batch_number}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{b.hospital_name}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 600, color: "var(--primary)" }}>{fmt(b.total_amount)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{b.claim_count} claims</div>
                </div>
              </div>
            ))}
          </div>

          {/* Date/time picker */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6, color: "var(--text-muted)" }}>
              Execute at (scheduled date &amp; time)
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              style={{ padding: "9px 12px", borderRadius: 7, border: "1.5px solid var(--primary)", fontSize: 13, width: "100%", boxSizing: "border-box" }}
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
              The FIFO scheduler will execute these batches in order when the scheduled time arrives. The background scheduler checks every 60s automatically.
            </p>
          </div>

          {result && (
            <div style={{
              padding: "10px 14px", borderRadius: 7, marginBottom: 14, fontSize: 13, fontWeight: 500,
              background: result.ok ? "var(--green-bg)" : "var(--red-bg)",
              color: result.ok ? "var(--green)" : "var(--red)",
            }}>{result.text}</div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, cursor: "pointer" }}>
              {result?.ok ? "Close" : "Cancel"}
            </button>
            {!result?.ok && (
              <button onClick={handle} disabled={loading}
                style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: loading ? "#93c5fd" : "var(--primary)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}>
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
  const [showModal, setShowModal]        = useState(false);
  const [autoCreating, setAutoCreating]  = useState(false);
  const [autoResult, setAutoResult]      = useState(null);
  const [batchSize, setBatchSize]        = useState(15);
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [filterStatus, setFilterStatus] = useState("");

  useAutoRefresh(() => { reload(); setLastRefresh(new Date()); }, 15000);

  const batches = data?.batches || [];
  const filtered = filterStatus ? batches.filter(b => b.status === filterStatus) : batches;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const summary = batches.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const selectedBatches = batches.filter(b => selected.has(b.id));
  const selectedTotal = selectedBatches.reduce((s, b) => s + Number(b.total_amount), 0);

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
          : `✓ Created ${res.total_batches} batch(es) from ${res.unbatched_claims} unbatched claims`,
      });
      reload(); setLastRefresh(new Date());
    } catch (e) {
      setAutoResult({ ok: false, text: e?.response?.data?.error || "Auto-create failed" });
    } finally { setAutoCreating(false); }
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Payment Batches</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Claims grouped by hospital → chunked into batches → scheduled for NCHL payment.
          </p>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Auto-create panel */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
        boxShadow: "var(--shadow)", padding: "18px 22px", marginBottom: 20, marginTop: 16,
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Auto-Create Batches from All Claims</div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          Groups all unbatched FHIR claims by hospital, then splits each hospital's claims into chunks of the selected size.
          Batches are created as <strong>PENDING</strong> — then select them below and click "Schedule Payment".
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginRight: 8 }}>
              Claims per batch:
            </label>
            {[5, 10, 15, 25, 50].map(n => (
              <button key={n} onClick={() => setBatchSize(n)}
                style={{
                  marginRight: 5, padding: "5px 12px", borderRadius: 7,
                  border: `2px solid ${batchSize === n ? "var(--primary)" : "var(--border)"}`,
                  background: batchSize === n ? "var(--blue-bg)" : "var(--surface)",
                  color: batchSize === n ? "var(--primary)" : "var(--text-muted)",
                  fontWeight: 600, fontSize: 12, cursor: "pointer",
                }}>{n}</button>
            ))}
            <input
              type="number" min="1" max="500" value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
              style={{ width: 70, padding: "5px 8px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}
            />
          </div>
          <button onClick={handleAutoCreate} disabled={autoCreating}
            style={{
              background: autoCreating ? "#93c5fd" : "var(--primary)", color: "#fff",
              border: "none", borderRadius: 8, padding: "9px 20px",
              fontWeight: 600, fontSize: 13, cursor: autoCreating ? "not-allowed" : "pointer",
            }}>
            {autoCreating ? "Creating…" : "⟳ Auto-Create Batches"}
          </button>
        </div>
        {autoResult && (
          <div style={{
            marginTop: 10, padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500,
            background: autoResult.ok ? "var(--green-bg)" : "var(--red-bg)",
            color: autoResult.ok ? "var(--green)" : "var(--red)",
          }}>{autoResult.text}</div>
        )}
      </div>

      {/* Status chips */}
      {Object.keys(summary).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {Object.entries(summary).map(([st, cnt]) => {
            const s = STATUS_STYLE[st] || { bg: "#f1f5f9", color: "#64748b" };
            return (
              <button key={st} onClick={() => setFilterStatus(filterStatus === st ? "" : st)}
                style={{
                  padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: s.bg, color: s.color, border: `2px solid ${filterStatus === st ? s.color : "transparent"}`,
                  cursor: "pointer",
                }}>
                {st}: {cnt}
              </button>
            );
          })}
          {filterStatus && (
            <button onClick={() => setFilterStatus("")}
              style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
              Clear ✕
            </button>
          )}
        </div>
      )}

      {/* Selection bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8,
          padding: "11px 16px", marginBottom: 14,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
            {selected.size} batch(es) selected · {fmt(selectedTotal)}
          </span>
          <button onClick={() => setShowModal(true)}
            style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Schedule Payment →
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
            Clear
          </button>
        </div>
      )}

      {loading && !data && <Spinner />}
      {error && <p style={{ color: "var(--red)" }}>Error: {error}</p>}

      {/* Batches table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "56px 32px", textAlign: "center", color: "var(--text-muted)" }}>
            <p style={{ fontSize: 32, marginBottom: 10 }}>📦</p>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No batches yet</p>
            <p style={{ fontSize: 13 }}>Click "Auto-Create Batches" above to group your FHIR claims by hospital.</p>
          </div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", width: 40 }}>
                    <input type="checkbox" checked={selected.size === pageRows.length && pageRows.length > 0} onChange={toggleAll} />
                  </th>
                  {["Batch Number", "Hospital", "Claims", "Total Amount", "Status", "In Queue", "Created"].map(h => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)",
                      fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--text-muted)",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((b, i) => (
                  <tr key={b.id} onClick={() => toggle(b.id)}
                    style={{
                      background: selected.has(b.id) ? "#eff6ff" : i % 2 === 0 ? "#fff" : "#f8fafc",
                      cursor: "pointer",
                      borderLeft: selected.has(b.id) ? "3px solid var(--primary)" : "3px solid transparent",
                    }}>
                    <td style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
                      <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", fontSize: 11 }}>
                      <div style={{ fontWeight: 600, color: "var(--primary)" }}>{b.batch_number}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 10 }}>id: {b.id}</div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 600 }}>{b.hospital_name || "—"}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{b.hospital_id}</div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center", fontWeight: 600 }}>
                      {b.claim_count}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
                      {fmt(b.total_amount)}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      <StatusPill status={b.status} />
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                      {b.in_queue
                        ? <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>✓ Queued</span>
                        : <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>
                      {new Date(b.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
            />
          </>
        )}
      </div>

      {showModal && (
        <ScheduleModal
          selected={selected}
          batches={batches}
          onClose={() => setShowModal(false)}
          onDone={() => { reload(); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
