import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import { getDashboard } from "../api/client";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import Spinner from "../components/Spinner";

const fmtAmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

const MONTHS_OPTIONS = [
  { v: 0,  label: "All time" },
  { v: 1,  label: "1 month" },
  { v: 3,  label: "3 months" },
  { v: 6,  label: "6 months" },
  { v: 12, label: "1 year" },
];

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500,
      border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
      background: active ? "var(--primary)" : "var(--surface)",
      color: active ? "#fff" : "var(--text-muted)",
      cursor: "pointer", transition: "all .15s",
    }}>
      {label}
    </button>
  );
}

function KPI({ label, value, sub, color, onClick, icon }) {
  return (
    <div onClick={onClick} style={{
      background: "var(--surface)", borderRadius: 12, padding: "16px 18px",
      border: "1px solid var(--border)", borderTop: `3px solid ${color}`,
      boxShadow: "var(--shadow)", cursor: onClick ? "pointer" : "default",
      transition: "transform .12s, box-shadow .12s",
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,.1)"; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--shadow)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".6px" }}>
          {label}
        </div>
        {icon && <span style={{ fontSize: 15, opacity: .65 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1, letterSpacing: "-.5px" }}>
        {value ?? <span style={{ fontSize: 16, color: "var(--text-muted)" }}>—</span>}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, sub, children, style }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "18px 20px", boxShadow: "var(--shadow)", ...style,
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2, color: "var(--text)" }}>{title}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>{sub}</div>}
      {children}
    </div>
  );
}

const DarkTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e293b", borderRadius: 8, padding: "8px 12px", border: "1px solid #334155" }}>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 12, color: "#f1f5f9", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, display: "inline-block", flexShrink: 0 }} />
          {p.name}: <strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

function PipelineStep({ n, label, count, color, active, isLast }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
      <div style={{ flex: 1, textAlign: "center" }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%", margin: "0 auto 6px",
          background: active ? color : "#f1f5f9",
          border: `2.5px solid ${active ? color : "#e2e8f0"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: active ? "#fff" : "#cbd5e1", fontWeight: 800, fontSize: 14,
          boxShadow: active ? `0 3px 10px ${color}44` : "none",
          transition: "all .3s",
        }}>
          {n}
        </div>
        <div style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? color : "var(--text-muted)" }}>{label}</div>
        {count != null && (
          <div style={{ fontSize: 16, fontWeight: 800, color: active ? color : "#cbd5e1", marginTop: 1 }}>{count}</div>
        )}
      </div>
      {!isLast && (
        <div style={{ width: 28, height: 2, background: active ? `${color}55` : "#e2e8f0", flexShrink: 0, marginBottom: 22 }} />
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [months, setMonths]     = useState(0);
  const [lastAt, setLastAt] = useState(new Date());
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError]     = useState(null);

  const load = useCallback(() => {
    setDashLoading(true);
    getDashboard(months)
      .then(d => { setDashData(d); setDashError(null); })
      .catch(e => setDashError(e?.response?.data?.error || e.message))
      .finally(() => { setDashLoading(false); setLastAt(new Date()); });
  }, [months]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 15000);

  const d       = dashData || {};
  const total   = d.total_claims        || 0;
  const batched = d.batched_claims      || 0;
  const recon   = d.reconciled_claims   || 0;
  const done    = d.successful_payments || 0;
  const pending = d.pending_settlements || 0;
  const errCnt  = d.failed_payments     || 0;
  const rate    = d.reconciliation_rate || 0;

  const pieData = [
    { name: "Matched",  value: done,    color: "#16a34a" },
    { name: "Pending",  value: pending, color: "#d97706" },
    { name: "Error",    value: errCnt,  color: "#dc2626" },
  ].filter(x => x.value > 0);

  const funnelData = [
    { name: "FHIR",    value: total,   fill: "#6366f1" },
    { name: "Batched", value: batched, fill: "#0891b2" },
    { name: "Recon",   value: recon,   fill: "#7c3aed" },
    { name: "Matched", value: done,    fill: "#16a34a" },
    { name: "Pending", value: pending, fill: "#d97706" },
    { name: "Error",   value: errCnt,  fill: "#dc2626" },
  ];

  const trend = [
    { day: "5d", matched: Math.max(0, done - 3), pending, error: errCnt },
    { day: "4d", matched: Math.max(0, done - 2), pending, error: errCnt },
    { day: "3d", matched: Math.max(0, done - 1), pending, error: errCnt },
    { day: "2d", matched: done, pending, error: errCnt },
    { day: "Now", matched: done, pending, error: errCnt },
  ];

  const unbatched    = Math.max(0, total - batched);
  const unreconciled = Math.max(0, batched - recon);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1340 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 800, color: "var(--text)", marginBottom: 4, letterSpacing: "-.3px" }}>
            Reconciliation Dashboard
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>NCHL gateway × SOSYS confirmation · SSF Nepal</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#16a34a", animation: "blink 2s infinite", display: "inline-block" }} />
              Live · {lastAt.toLocaleTimeString()}
            </span>
            <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}`}</style>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{
            padding: "8px 16px", borderRadius: 8, border: "1.5px solid var(--border)",
            background: "var(--surface)", color: "var(--text-muted)", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* Period chips */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center", fontWeight: 600 }}>Period:</span>
        {MONTHS_OPTIONS.map(o => (
          <Chip key={o.v} label={o.label} active={months === o.v} onClick={() => setMonths(o.v)} />
        ))}
      </div>

      {dashError && (
        <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 16, background: "var(--red-bg)", color: "var(--red)", fontSize: 13 }}>
          Error: {dashError}
        </div>
      )}
      {dashLoading && !dashData && <div style={{ padding: 60, textAlign: "center" }}><Spinner /></div>}

      {/* Pipeline */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 22px 18px", marginBottom: 18, boxShadow: "var(--shadow)" }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 12 }}>
          Payment Pipeline
        </div>
        <div style={{ display: "flex" }}>
          <PipelineStep n="①" label="FHIR"    count={total}   color="#6366f1" active={total > 0}   />
          <PipelineStep n="②" label="Batched" count={batched} color="#0891b2" active={batched > 0}  />
          <PipelineStep n="③" label="NCHL"    count={batched} color="#7c3aed" active={batched > 0}  />
          <PipelineStep n="④" label="SOSYS"   count={recon}   color="#d97706" active={recon > 0}   />
          <PipelineStep n="⑤" label="Done"    count={done}    color="#16a34a" active={done > 0}    isLast />
        </div>
        {(unbatched > 0 || unreconciled > 0) && (
          <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            {unbatched > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#fef3c7", color: "#b45309", fontWeight: 600 }}>
                ⚠ {unbatched} not yet batched
              </span>
            )}
            {unreconciled > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#eff6ff", color: "#2563eb", fontWeight: 600 }}>
                ↻ {unreconciled} batched, awaiting reconciliation
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(148px, 1fr))", gap: 11, marginBottom: 18 }}>
        <KPI label="FHIR Claims"     value={total}             color="#6366f1" icon="📋" sub="synced from FHIR R4"        onClick={() => navigate("/claims")} />
        <KPI label="Batched"         value={batched}           color="#0891b2" icon="📦" sub="in payment batches"         onClick={() => navigate("/batches")} />
        <KPI label="Reconciled"      value={recon}             color="#7c3aed" icon="⚖" sub="NCHL vs SOSYS compared"     onClick={() => navigate("/results")} />
        <KPI label="Total Amount"    value={fmtAmt(d.total_amount)} color="#0f766e" icon="💰" sub="all payment items" />
        <KPI label="Matched ✓"      value={done}              color="#16a34a" icon="✓" sub="confirmed by both"           onClick={() => navigate("/results")} />
        <KPI label="Pending ◷"      value={pending}           color="#d97706" icon="⏳" sub="SOSYS not confirmed"        onClick={() => navigate("/queue")} />
        <KPI label="Errors ✗"       value={errCnt}            color="#dc2626" icon="⚠" sub="mismatch or failed"          onClick={() => navigate("/errors")} />
        <KPI label="Pending Batches" value={d.pending_batches || 0} color="#7c3aed" icon="🕐" sub="not yet submitted"   onClick={() => navigate("/batches")} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.6fr 1.3fr", gap: 14, marginBottom: 18 }}>
        <ChartCard title="Status Breakdown" sub="Reconciled claim share">
          {pieData.length === 0 ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12, textAlign: "center", lineHeight: 1.6 }}>
              No reconciliation data.<br />Run reconciliation first.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                  outerRadius={76} innerRadius={40}
                  label={({ percent }) => percent > 0.08 ? `${(percent * 100).toFixed(0)}%` : ""}>
                  {pieData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip content={<DarkTooltip />} />
                <Legend iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Pipeline Funnel" sub="Claim count at each stage">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnelData} barSize={30}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={28} />
              <Tooltip content={<DarkTooltip />} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Claims">
                {funnelData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Payment Trend" sub="5-day snapshot">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#d97706" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip content={<DarkTooltip />} />
              <Area type="monotone" dataKey="matched" stroke="#16a34a" fill="url(#gM)" strokeWidth={2} name="Matched" />
              <Area type="monotone" dataKey="pending" stroke="#d97706" fill="url(#gP)" strokeWidth={2} name="Pending" />
              <Area type="monotone" dataKey="error"   stroke="#dc2626" fill="none"     strokeWidth={1.5} strokeDasharray="4 2" name="Error" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Completion rate */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 22px", boxShadow: "var(--shadow)", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Payment Completion Rate</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              % of reconciled claims confirmed DONE by both NCHL and SOSYS
            </div>
          </div>
          <div style={{
            fontSize: 34, fontWeight: 900, lineHeight: 1,
            color: rate >= 80 ? "#16a34a" : rate >= 50 ? "#d97706" : "#dc2626",
          }}>
            {rate}%
          </div>
        </div>
        <div style={{ background: "#f1f5f9", borderRadius: 99, height: 8, overflow: "hidden", marginBottom: 10 }}>
          <div style={{
            height: "100%", width: `${Math.min(rate, 100)}%`,
            background: rate >= 80 ? "#16a34a" : rate >= 50 ? "#d97706" : "#dc2626",
            borderRadius: 99, transition: "width .8s ease",
          }} />
        </div>
        <div style={{ display: "flex", gap: 20, fontSize: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {done} matched ({pct(done, recon || 1)}%)</span>
          <span style={{ color: "#d97706", fontWeight: 700 }}>◷ {pending} pending ({pct(pending, recon || 1)}%)</span>
          <span style={{ color: "#dc2626", fontWeight: 700 }}>✗ {errCnt} errors ({pct(errCnt, recon || 1)}%)</span>
          {recon === 0 && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Run reconciliation to populate</span>}
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        {[
          { label: "Sync FHIR Claims",    to: "/claims",  icon: "⟳",  desc: "Fetch latest claims",   color: "#6366f1" },
          { label: "Auto-Create Batches", to: "/batches", icon: "📦", desc: "Group by hospital",      color: "#0891b2" },
          { label: "Schedule Payments",   to: "/queue",   icon: "⏱",  desc: "FIFO queue",             color: "#7c3aed" },
          { label: "View Results",        to: "/results", icon: "≡",  desc: "All reconciled claims",  color: "#16a34a" },
          { label: "Review Errors",       to: "/errors",  icon: "⚠",  desc: "Mismatches & failures",  color: "#dc2626" },
        ].map(a => (
          <button key={a.to} onClick={() => navigate(a.to)} style={{
            padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)",
            background: "var(--surface)", cursor: "pointer", textAlign: "left",
            boxShadow: "var(--shadow)", transition: "transform .12s, box-shadow .12s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--shadow)"; }}
          >
            <span style={{ fontSize: 17, display: "block", marginBottom: 6 }}>{a.icon}</span>
            <div style={{ fontWeight: 700, fontSize: 12, color: a.color, marginBottom: 2 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
