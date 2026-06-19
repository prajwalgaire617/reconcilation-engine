import { useState, useEffect, useCallback } from "react";
import { getOpsSummary, getOpsActivity } from "../api/client";
import Spinner from "../components/Spinner";

const fmtAmt = (v) =>
  v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const fmtTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const PRIORITY_META = {
  CRITICAL: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#dc2626" },
  HIGH:     { color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", dot: "#ea580c" },
  MEDIUM:   { color: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#d97706" },
  LOW:      { color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
};

const EVENT_META = {
  BATCH_SUBMITTED:   { icon: "▶", color: "#1d4ed8" },
  CLAIM_RECONCILED:  { icon: "✓", color: "#16a34a" },
  MISMATCH_DETECTED: { icon: "✗", color: "#dc2626" },
  SETTLEMENT_PENDING:{ icon: "◷", color: "#b45309" },
  QUEUE_EXECUTED:    { icon: "⚡", color: "#7c3aed" },
};

function MetricTile({ value, label, sub, accent, critical }) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${critical ? "#fecaca" : "var(--border)"}`,
      borderTop: `3px solid ${accent || "var(--border)"}`,
      borderRadius: 6,
      padding: "14px 16px",
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 24,
        fontWeight: 700,
        color: critical ? "#dc2626" : "var(--text)",
        letterSpacing: "-.03em",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.1,
      }}>
        {value ?? "—"}
      </div>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: ".5px",
        color: "var(--text-muted)",
        marginTop: 5,
      }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

function PriorityBadge({ priority }) {
  const m = PRIORITY_META[priority] || PRIORITY_META.LOW;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 3,
      fontSize: 9, fontWeight: 800, letterSpacing: ".4px", textTransform: "uppercase",
      color: m.color, background: m.bg, border: `1px solid ${m.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot }} />
      {priority}
    </span>
  );
}

export default function OperationsCenter() {
  const [summary, setSummary] = useState(null);
  const [activity, setActivity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([getOpsSummary(), getOpsActivity()]);
      setSummary(s);
      setActivity(a);
      setLastRefresh(new Date());
      setError(null);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Spinner />
      </div>
    );
  }

  const s = summary || {};
  const events = activity?.events || [];
  const queue = s.action_queue || [];

  const criticalQueue = queue.filter(q => q.priority === "CRITICAL" || q.priority === "HIGH");
  const normalQueue   = queue.filter(q => q.priority !== "CRITICAL" && q.priority !== "HIGH");

  return (
    <div style={{ padding: "22px 28px", maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 4 }}>
            Operations Center
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
            Settlement Control
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {lastRefresh
              ? `Last updated ${lastRefresh.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : "Loading..."}
          </div>
        </div>
        <button
          onClick={load}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 6,
            border: "1px solid var(--border)",
            background: "#fff", color: "var(--text-secondary)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginBottom: 16,
          background: "var(--red-bg)", border: "1px solid var(--red-border)",
          color: "var(--red)", fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {/* Critical alert strip */}
      {(s.failed_payments > 0 || s.review_required > 0) && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 16px", marginBottom: 16,
          background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6,
          fontSize: 12,
        }}>
          <span style={{ fontSize: 16 }}>⚠</span>
          <span style={{ fontWeight: 600, color: "#991b1b" }}>
            {s.failed_payments > 0 && `${s.failed_payments} failed payment${s.failed_payments !== 1 ? "s" : ""}`}
            {s.failed_payments > 0 && s.review_required > 0 && " · "}
            {s.review_required > 0 && `${s.review_required} claim${s.review_required !== 1 ? "s" : ""} require review`}
          </span>
          {s.money_at_risk > 0 && (
            <span style={{ color: "#dc2626", fontWeight: 700, marginLeft: "auto" }}>
              {fmtAmt(s.money_at_risk)} at risk
            </span>
          )}
        </div>
      )}

      {/* Metric strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 22 }}>
        <MetricTile
          value={s.total_reconciled?.toLocaleString()}
          label="Total Reconciled"
          sub="all time"
          accent="#16a34a"
        />
        <MetricTile
          value={fmtAmt(s.amount_settled_today)}
          label="Settled Today"
          sub={`${s.batches_today || 0} batch${s.batches_today !== 1 ? "es" : ""}`}
          accent="#1d4ed8"
        />
        <MetricTile
          value={fmtAmt(s.pending_settlement)}
          label="Pending Settlement"
          sub="awaiting confirmation"
          accent="#b45309"
        />
        <MetricTile
          value={s.failed_payments ?? 0}
          label="Failed Payments"
          sub="require action"
          accent="#dc2626"
          critical={s.failed_payments > 0}
        />
        <MetricTile
          value={s.review_required ?? 0}
          label="Under Review"
          sub="mismatches / exceptions"
          accent="#7c3aed"
          critical={s.review_required > 0}
        />
        <MetricTile
          value={fmtAmt(s.money_at_risk)}
          label="Money at Risk"
          sub="mismatch + investigation"
          accent="#dc2626"
          critical={(s.money_at_risk || 0) > 0}
        />
      </div>

      {/* Two-column: Action Queue | Activity Feed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>

        {/* Action Queue */}
        <div style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "var(--shadow-xs)",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-raised)",
          }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Action Queue</span>
              <span style={{
                marginLeft: 8,
                display: "inline-flex", alignItems: "center",
                padding: "1px 7px", borderRadius: 100,
                background: queue.length > 0 ? "#fef2f2" : "#f0fdf4",
                color: queue.length > 0 ? "#dc2626" : "#16a34a",
                fontSize: 10, fontWeight: 700,
                border: `1px solid ${queue.length > 0 ? "#fecaca" : "#bbf7d0"}`,
              }}>
                {queue.length} item{queue.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>Claims requiring attention</span>
          </div>

          {queue.length === 0 ? (
            <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--text-muted)" }}>
              <div style={{ fontSize: 24, marginBottom: 8, opacity: .4 }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>No pending actions</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>All claims are reconciled or in progress</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["Priority", "Claim ID", "Patient", "Hospital", "Amount (NPR)", "Status", "Reason"].map(h => (
                    <th key={h} style={{
                      padding: "8px 12px", textAlign: "left",
                      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px",
                      color: "var(--text-muted)", borderBottom: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Critical/High first */}
                {[...criticalQueue, ...normalQueue].map((item, i) => {
                  const pm = PRIORITY_META[item.priority] || PRIORITY_META.LOW;
                  return (
                    <tr key={item.claim_id || i} style={{
                      background: item.priority === "CRITICAL" ? "#fffbfb" : i % 2 === 0 ? "#fff" : "#fafafa",
                    }}>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <PriorityBadge priority={item.priority} />
                      </td>
                      <td style={{
                        padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)",
                        fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: "var(--primary)",
                      }}>
                        {item.claim_id}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                        {item.patient_name || "—"}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
                        {item.hospital_name || "—"}
                      </td>
                      <td style={{
                        padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)",
                        textAlign: "right", fontFamily: "monospace", fontSize: 11, fontWeight: 600,
                      }}>
                        {item.amount ? Number(item.amount).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—"}
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{
                          padding: "2px 7px", borderRadius: 3,
                          fontSize: 9, fontWeight: 700,
                          background: pm.bg, color: pm.color,
                          textTransform: "uppercase", letterSpacing: ".3px",
                        }}>
                          {item.status?.replace(/_/g, " ") || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "9px 12px", borderBottom: "1px solid var(--border-subtle)", color: "var(--text-muted)", maxWidth: 180 }}>
                        <span style={{ fontSize: 11, fontStyle: "italic" }}>{item.reason || "—"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Activity Feed */}
        <div style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          boxShadow: "var(--shadow-xs)",
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-raised)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Activity Feed</span>
            <span style={{ fontSize: 10, color: "var(--text-faint)" }}>Last 48 hours</span>
          </div>

          <div style={{ maxHeight: 520, overflowY: "auto", padding: "14px 16px" }}>
            {events.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-faint)", fontSize: 12 }}>
                No recent activity
              </div>
            ) : (
              <div style={{ position: "relative", paddingLeft: 22 }}>
                {/* Timeline line */}
                <div style={{
                  position: "absolute", left: 7, top: 8, bottom: 8,
                  width: 1, background: "var(--border)",
                }} />

                {events.map((ev, i) => {
                  const m = EVENT_META[ev.type] || { icon: "·", color: "var(--text-muted)" };
                  const isCritical = ev.severity === "error";
                  const isWarning  = ev.severity === "warning";

                  return (
                    <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                      {/* Timeline dot */}
                      <div style={{
                        position: "absolute",
                        left: -18,
                        top: 3,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: isCritical ? "#dc2626" : isWarning ? "#d97706" : m.color,
                        border: "1.5px solid #fff",
                        boxShadow: `0 0 0 1.5px ${isCritical ? "#fecaca" : isWarning ? "#fde68a" : "var(--border)"}`,
                      }} />

                      <div style={{
                        padding: "8px 10px",
                        borderRadius: 5,
                        border: `1px solid ${isCritical ? "var(--red-border)" : isWarning ? "var(--amber-border)" : "var(--border-subtle)"}`,
                        background: isCritical ? "var(--red-bg)" : isWarning ? "var(--amber-bg)" : "var(--surface-raised)",
                      }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                            {ev.description}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-faint)", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {fmtTime(ev.ts)}
                          </div>
                        </div>
                        {ev.ref && (
                          <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 3, fontFamily: "monospace" }}>
                            ref: {ev.ref}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Second row: unreconciled amount + batches today summary */}
      {(s.unreconciled_amount > 0 || s.batches_today > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 16 }}>
          <div style={{
            background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 6 }}>
              Unreconciled Amount
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#b45309", letterSpacing: "-.02em" }}>
              {fmtAmt(s.unreconciled_amount)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              Payments sent to NCHL but not yet confirmed in SOSYS
            </div>
          </div>
          <div style={{
            background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 18px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 6 }}>
              Today's Processing
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
              {s.batches_today || 0} batch{s.batches_today !== 1 ? "es" : ""}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
              {fmtAmt(s.amount_settled_today)} total settled in today's runs
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
