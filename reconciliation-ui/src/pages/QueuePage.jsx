import { useState } from "react";
import { getQueue, executeQueue, cancelQueueEntry, moveQueueEntry, enqueueBatches } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import Spinner from "../components/Spinner";

const fmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const STATUS_STYLE = {
  QUEUED:    { bg: "#eff6ff", color: "#2563eb" },
  EXECUTING: { bg: "#fef3c7", color: "#b45309" },
  COMPLETED: { bg: "#dcfce7", color: "#16a34a" },
  FAILED:    { bg: "#fee2e2", color: "#dc2626" },
  CANCELLED: { bg: "#f1f5f9", color: "#64748b" },
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

function LiveDot() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#16a34a" }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: "#16a34a",
        animation: "pulse 2s infinite", display: "inline-block",
      }} />
      Live · auto-refresh 10s
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </span>
  );
}

function EnqueueForm({ onSuccess }) {
  const [batchIds, setBatchIds] = useState("");
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 5);
    return d.toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);

  async function handle() {
    const ids = batchIds.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (!ids.length) { setMsg({ ok: false, text: "Enter at least one batch ID" }); return; }
    setLoading(true); setMsg(null);
    try {
      const res = await enqueueBatches(ids, new Date(scheduledAt).toISOString());
      setMsg({ ok: true, text: `✓ Added ${res.queued} batch(es) to queue` });
      setBatchIds("");
      onSuccess();
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.error || "Failed" });
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
      boxShadow: "var(--shadow)", padding: "18px 22px", marginBottom: 20,
    }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Add Batches to Queue</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            Batch IDs (comma-separated)
          </label>
          <input
            value={batchIds}
            onChange={e => setBatchIds(e.target.value)}
            placeholder="e.g. 1, 2, 5"
            style={{ width: "100%", padding: "8px 12px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            Scheduled at
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 7, border: "1.5px solid var(--primary)", fontSize: 13 }}
          />
        </div>
        <button onClick={handle} disabled={loading}
          style={{
            background: loading ? "#93c5fd" : "var(--primary)", color: "#fff",
            border: "none", borderRadius: 8, padding: "9px 20px",
            fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer",
            alignSelf: "flex-end",
          }}>
          {loading ? "Adding…" : "+ Add to Queue"}
        </button>
      </div>
      {msg && (
        <div style={{
          marginTop: 10, padding: "8px 12px", borderRadius: 7, fontSize: 13, fontWeight: 500,
          background: msg.ok ? "var(--green-bg)" : "var(--red-bg)",
          color: msg.ok ? "var(--green)" : "var(--red)",
        }}>{msg.text}</div>
      )}
    </div>
  );
}

export default function QueuePage() {
  const { data, loading, error, reload } = useFetch(getQueue);
  const [lastRefresh, setLastRefresh]    = useState(new Date());
  const [executing, setExecuting]        = useState(false);
  const [execResult, setExecResult]      = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  useAutoRefresh(() => {
    reload();
    setLastRefresh(new Date());
  }, 10000);

  // API returns { count, queue: [...] }
  const entries = data?.queue || [];

  const summary = entries.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {});

  const queuedEntries = entries.filter(e => e.status === "QUEUED");
  const dueCount = queuedEntries.filter(e => new Date(e.scheduled_at) <= new Date()).length;

  async function handleExecute() {
    setExecuting(true); setExecResult(null);
    try {
      const res = await executeQueue();
      setExecResult({
        ok: true,
        text: `✓ Executed ${res.executed} batch(es). ${res.skipped} skipped${res.errors?.length ? ` — ${res.errors.length} error(s).` : "."}`,
      });
      reload(); setLastRefresh(new Date());
    } catch (e) {
      setExecResult({ ok: false, text: e?.response?.data?.error || "Execution failed" });
    } finally { setExecuting(false); }
  }

  async function handleCancel(id) {
    setActionLoading(p => ({ ...p, [`cancel_${id}`]: true }));
    try { await cancelQueueEntry(id); reload(); }
    catch (e) { alert(e?.response?.data?.error || "Cancel failed"); }
    finally { setActionLoading(p => ({ ...p, [`cancel_${id}`]: false })); }
  }

  async function handleMove(id, direction) {
    setActionLoading(p => ({ ...p, [`move_${id}_${direction}`]: true }));
    try { await moveQueueEntry(id, direction); reload(); }
    catch (e) { alert(e?.response?.data?.error || "Move failed"); }
    finally { setActionLoading(p => ({ ...p, [`move_${id}_${direction}`]: false })); }
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Payment Queue</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              FIFO scheduled payment queue — batches execute in position order.
            </p>
            <LiveDot />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <button onClick={handleExecute} disabled={executing || dueCount === 0}
            style={{
              background: executing || dueCount === 0 ? "#93c5fd" : "var(--primary)",
              color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px",
              fontWeight: 600, fontSize: 13, cursor: executing || dueCount === 0 ? "not-allowed" : "pointer",
              boxShadow: "var(--shadow-md)",
            }}>
            {executing ? "Executing…" : `▶ Execute Due (${dueCount})`}
          </button>
          {dueCount === 0 && queuedEntries.length > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {queuedEntries.length} queued — not yet scheduled
            </span>
          )}
        </div>
      </div>

      {execResult && (
        <div style={{
          padding: "12px 16px", borderRadius: 8, marginBottom: 16,
          background: execResult.ok ? "var(--green-bg)" : "var(--red-bg)",
          color: execResult.ok ? "var(--green)" : "var(--red)", fontWeight: 500, fontSize: 13,
        }}>{execResult.text}</div>
      )}

      {/* Summary chips */}
      {Object.keys(summary).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {Object.entries(summary).map(([st, count]) => {
            const s = STATUS_STYLE[st] || { bg: "#f1f5f9", color: "#64748b" };
            return (
              <span key={st} style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: s.bg, color: s.color,
              }}>
                {st}: {count}
              </span>
            );
          })}
        </div>
      )}

      {/* Add to queue form */}
      <EnqueueForm onSuccess={() => { reload(); setLastRefresh(new Date()); }} />

      {loading && !data && <Spinner />}
      {error && <p style={{ color: "var(--red)" }}>Error: {error}</p>}

      {/* Queue table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
        {entries.length === 0 ? (
          <div style={{ padding: "56px 32px", textAlign: "center", color: "var(--text-muted)" }}>
            <p style={{ fontSize: 32, marginBottom: 10 }}>📋</p>
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Queue is empty</p>
            <p style={{ fontSize: 13 }}>Create batches on the Claims page with "Add to Queue" mode, then they appear here.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["#", "Batch", "Hospital", "Claims", "Amount", "Scheduled At", "Status", "Executed At", "Actions"].map(h => (
                  <th key={h} style={{
                    padding: "10px 14px", textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                    fontWeight: 600, fontSize: 11, textTransform: "uppercase",
                    letterSpacing: ".4px", color: "var(--text-muted)",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const isQueued  = e.status === "QUEUED";
                const isDue     = isQueued && new Date(e.scheduled_at) <= new Date();
                const queuedIdx = queuedEntries.findIndex(q => q.id === e.id);
                const canMoveUp = isQueued && queuedIdx > 0;
                const canMoveDn = isQueued && queuedIdx < queuedEntries.length - 1;
                return (
                  <tr key={e.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--text-muted)", width: 40 }}>
                      {e.position}
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", fontSize: 11 }}>
                      <div style={{ fontWeight: 600, color: "var(--primary)" }}>{e.batch_number}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 10 }}>id: {e.batch_id}</div>
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      {e.hospital || "—"}
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                      {e.claim_count ?? "—"}
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600 }}>
                      {fmt(e.total_amount)}
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ fontSize: 12 }}>{new Date(e.scheduled_at).toLocaleString()}</div>
                      {isDue && (
                        <div style={{ fontSize: 10, color: "var(--primary)", fontWeight: 700, marginTop: 2 }}>⚡ DUE NOW</div>
                      )}
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      <StatusPill status={e.status} />
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>
                      {e.executed_at ? new Date(e.executed_at).toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={() => handleMove(e.id, "up")}
                          disabled={!canMoveUp || actionLoading[`move_${e.id}_up`]}
                          title="Move up"
                          style={{
                            padding: "4px 8px", borderRadius: 6,
                            border: "1px solid var(--border)", background: "var(--surface)",
                            cursor: !canMoveUp ? "not-allowed" : "pointer",
                            opacity: !canMoveUp ? .4 : 1, fontSize: 13,
                          }}>▲</button>
                        <button
                          onClick={() => handleMove(e.id, "down")}
                          disabled={!canMoveDn || actionLoading[`move_${e.id}_down`]}
                          title="Move down"
                          style={{
                            padding: "4px 8px", borderRadius: 6,
                            border: "1px solid var(--border)", background: "var(--surface)",
                            cursor: !canMoveDn ? "not-allowed" : "pointer",
                            opacity: !canMoveDn ? .4 : 1, fontSize: 13,
                          }}>▼</button>
                        <button
                          onClick={() => handleCancel(e.id)}
                          disabled={!isQueued || actionLoading[`cancel_${e.id}`]}
                          title="Cancel"
                          style={{
                            padding: "4px 9px", borderRadius: 6,
                            border: "1px solid #fecaca", background: "#fee2e2",
                            color: "#dc2626", cursor: !isQueued ? "not-allowed" : "pointer",
                            opacity: !isQueued ? .4 : 1, fontSize: 12, fontWeight: 600,
                          }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ marginTop: 14, padding: "11px 16px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)" }}>
        <strong>How it works:</strong> Batches process in position order (FIFO). "Execute Due" sends all QUEUED batches whose scheduled time has passed to NCHL. Use ▲/▼ to reorder. Only QUEUED entries can be moved or cancelled.
      </div>
    </div>
  );
}
