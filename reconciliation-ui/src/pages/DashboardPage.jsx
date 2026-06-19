import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";
import { getDashboard, runReconciliation } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import Spinner from "../components/Spinner";

const fmt = (n) => n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

function KPICard({ label, value, sub, accent, delta, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "18px 20px", boxShadow: "var(--shadow)",
        borderTop: `3px solid ${accent}`, cursor: onClick ? "pointer" : "default",
        transition: "transform .1s, box-shadow .1s",
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => e.currentTarget.style.transform = ""}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: ".5px", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1 }}>{value ?? "—"}</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{sub}</div>
      {delta != null && (
        <div style={{ fontSize: 11, color: delta >= 0 ? "#16a34a" : "#dc2626", marginTop: 3, fontWeight: 600 }}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

function PipelineStep({ step, label, count, color, active }) {
  return (
    <div style={{ flex: 1, textAlign: "center", position: "relative" }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%", margin: "0 auto 8px",
        background: active ? color : "#f1f5f9",
        border: `3px solid ${active ? color : "#e2e8f0"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, color: active ? "#fff" : "#94a3b8",
        transition: "all .3s",
        boxShadow: active ? `0 4px 14px ${color}44` : "none",
      }}>
        {step}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: active ? color : "var(--text-muted)" }}>{label}</div>
      {count != null && (
        <div style={{ fontSize: 16, fontWeight: 800, color: active ? color : "var(--text-muted)", marginTop: 2 }}>{count}</div>
      )}
    </div>
  );
}

function LiveDot({ label = "Live · 15s" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#16a34a" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", animation: "pulse 2s infinite", display: "inline-block" }} />
      {label}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
    </span>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(getDashboard);
  const [running, setRunning]     = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [lastAt, setLastAt]       = useState(new Date());

  useAutoRefresh(() => { reload(); setLastAt(new Date()); }, 15000);

  async function handleRun() {
    setRunning(true); setRunResult(null);
    try {
      const r = await runReconciliation();
      setRunResult({ ok: true, msg: `Reconciled ${r.total_claims} claims — ${r.matched} matched` });
      reload();
    } catch (e) {
      setRunResult({ ok: false, msg: e?.response?.data?.error || "Failed" });
    } finally { setRunning(false); }
  }

  const d = data || {};
  const total    = d.total_claims   || 0;
  const batched  = d.batched_claims || 0;
  const recon    = d.reconciled_claims || 0;
  const done     = d.successful_payments || 0;
  const pending  = d.pending_settlements || 0;
  const errCount = d.failed_payments || 0;
  const rate     = d.reconciliation_rate || 0;

  const pieData = [
    { name: "DONE",    value: done,     color: "#16a34a" },
    { name: "PENDING", value: pending,  color: "#d97706" },
    { name: "ERROR",   value: errCount, color: "#dc2626" },
  ].filter(x => x.value > 0);

  const barData = [
    { name: "FHIR\nClaims",   value: total,   fill: "#6366f1" },
    { name: "Batched",         value: batched, fill: "#0891b2" },
    { name: "Reconciled",      value: recon,   fill: "#7c3aed" },
    { name: "DONE",            value: done,    fill: "#16a34a" },
    { name: "PENDING",         value: pending, fill: "#d97706" },
    { name: "ERROR",           value: errCount,fill: "#dc2626" },
  ];

  // Simulated trend for demo (replace with real time-series in production)
  const trendData = [
    { day: "Mon", done: Math.max(0,done-4), pending: Math.max(0,pending-2), error: Math.max(0,errCount-1) },
    { day: "Tue", done: Math.max(0,done-3), pending: Math.max(0,pending-1), error: Math.max(0,errCount-1) },
    { day: "Wed", done: Math.max(0,done-2), pending: pending, error: errCount },
    { day: "Thu", done: Math.max(0,done-1), pending: pending, error: errCount },
    { day: "Fri", done: done, pending: pending, error: errCount },
  ];

  const unbatched = Math.max(0, total - batched);
  const unreconciled = Math.max(0, batched - recon);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1300 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, color: "var(--text)" }}>
            Payment Reconciliation
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
              NCHL gateway × SOSYS confirmation × bank truth
            </p>
            <LiveDot />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Last refreshed: <strong>{lastAt.toLocaleTimeString()}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => navigate("/queue")}
            style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid var(--primary)", background: "var(--blue-bg)", color: "var(--primary)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            ⏱ Queue
          </button>
          <button onClick={handleRun} disabled={running}
            style={{ background: running ? "#93c5fd" : "var(--primary)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: running ? "not-allowed" : "pointer", boxShadow: "var(--shadow-md)" }}>
            {running ? "Running…" : "⟳ Run Reconciliation"}
          </button>
        </div>
      </div>

      {runResult && (
        <div style={{ padding: "12px 16px", borderRadius: 8, marginBottom: 18, background: runResult.ok ? "var(--green-bg)" : "var(--red-bg)", color: runResult.ok ? "var(--green)" : "var(--red)", fontWeight: 500, fontSize: 13 }}>
          {runResult.ok ? `✓ ${runResult.msg}` : `✗ ${runResult.msg}`}
        </div>
      )}

      {loading && !data && <Spinner />}
      {error && <div style={{ padding: 16, background: "var(--red-bg)", color: "var(--red)", borderRadius: 8, marginBottom: 20 }}>Error: {error}</div>}

      {/* Pipeline Flow */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 28px", marginBottom: 22, boxShadow: "var(--shadow)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 16, textTransform: "uppercase", letterSpacing: ".5px" }}>
          Payment Pipeline
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          <PipelineStep step="①" label="FHIR Claims"    count={total}   color="#6366f1" active={total > 0} />
          <div style={{ flex: "0 0 30px", height: 2, background: batched > 0 ? "#6366f1" : "#e2e8f0", marginBottom: 28 }} />
          <PipelineStep step="②" label="Batched"        count={batched} color="#0891b2" active={batched > 0} />
          <div style={{ flex: "0 0 30px", height: 2, background: recon > 0 ? "#0891b2" : "#e2e8f0", marginBottom: 28 }} />
          <PipelineStep step="③" label="Sent to NCHL"   count={batched} color="#7c3aed" active={batched > 0} />
          <div style={{ flex: "0 0 30px", height: 2, background: recon > 0 ? "#7c3aed" : "#e2e8f0", marginBottom: 28 }} />
          <PipelineStep step="④" label="SOSYS Check"    count={recon}   color="#d97706" active={recon > 0} />
          <div style={{ flex: "0 0 30px", height: 2, background: done > 0 ? "#d97706" : "#e2e8f0", marginBottom: 28 }} />
          <PipelineStep step="⑤" label="DONE"           count={done}    color="#16a34a" active={done > 0} />
        </div>
        {(unbatched > 0 || unreconciled > 0) && (
          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            {unbatched > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#fef3c7", color: "#b45309", fontWeight: 600 }}>
                ⚠ {unbatched} claims not yet batched
              </span>
            )}
            {unreconciled > 0 && (
              <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#eff6ff", color: "#2563eb", fontWeight: 600 }}>
                ↻ {unreconciled} batched but not reconciled
              </span>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        <KPICard label="Total FHIR Claims" value={total}   accent="#6366f1" sub="synced from FHIR"       onClick={() => navigate("/claims")} />
        <KPICard label="Batched Claims"    value={batched} accent="#0891b2" sub="in payment batches"     onClick={() => navigate("/batches")} />
        <KPICard label="Reconciled"        value={recon}   accent="#7c3aed" sub="engine processed"       onClick={() => navigate("/results")} />
        <KPICard label="Total Amount"      value={fmt(d.total_amount)} accent="#0f766e" sub="all batch items" />
        <KPICard label="DONE ✓"           value={done}    accent="#16a34a" sub="NCHL + SOSYS confirmed"  onClick={() => navigate("/results")} />
        <KPICard label="PENDING ◷"        value={pending} accent="#d97706" sub="awaiting confirmation"   onClick={() => navigate("/queue")} />
        <KPICard label="ERROR ✗"          value={errCount}accent="#dc2626" sub="needs investigation"     onClick={() => navigate("/errors")} />
        <KPICard label="Pending Batches"   value={d.pending_batches || 0} accent="#7c3aed" sub="not yet submitted" onClick={() => navigate("/batches")} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 22 }}>
        {/* Pie */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 14px", boxShadow: "var(--shadow)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Status Breakdown</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Share of reconciled claims</div>
          {pieData.length === 0 ? (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>
              Run reconciliation to see data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={76} innerRadius={36}
                  label={({ name, percent }) => percent > 0.06 ? `${(percent * 100).toFixed(0)}%` : ""}>
                  {pieData.map(e => <Cell key={e.name} fill={e.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend iconType="circle" iconSize={9} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar — pipeline funnel */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 14px", boxShadow: "var(--shadow)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Pipeline Funnel</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Claims at each stage</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barSize={24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => [v + " claims"]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {barData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Area — trend */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 14px", boxShadow: "var(--shadow)" }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Payment Trend</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>5-day payment status trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#16a34a" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#d97706" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Area type="monotone" dataKey="done"    stroke="#16a34a" fill="url(#gDone)"    strokeWidth={2} name="DONE" />
              <Area type="monotone" dataKey="pending" stroke="#d97706" fill="url(#gPending)" strokeWidth={2} name="PENDING" />
              <Area type="monotone" dataKey="error"   stroke="#dc2626" fill="none"           strokeWidth={2} name="ERROR" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Completion rate */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", boxShadow: "var(--shadow)", marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Payment Completion Rate</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              % of batched claims confirmed DONE by both NCHL and SOSYS
            </div>
          </div>
          <span style={{
            fontWeight: 900, fontSize: 32,
            color: rate >= 80 ? "#16a34a" : rate >= 50 ? "#d97706" : "#dc2626",
          }}>{rate}%</span>
        </div>
        <div style={{ background: "var(--border)", borderRadius: 99, height: 14, overflow: "hidden", marginBottom: 10 }}>
          <div style={{
            height: "100%", width: `${rate}%`,
            background: rate >= 80 ? "#16a34a" : rate >= 50 ? "#d97706" : "#dc2626",
            borderRadius: 99, transition: "width .7s ease",
          }} />
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 12 }}>
          <span style={{ color: "#16a34a", fontWeight: 700 }}>✓ {done} DONE ({pct(done, recon || 1)}%)</span>
          <span style={{ color: "#d97706", fontWeight: 700 }}>◷ {pending} PENDING ({pct(pending, recon || 1)}%)</span>
          <span style={{ color: "#dc2626", fontWeight: 700 }}>✗ {errCount} ERROR ({pct(errCount, recon || 1)}%)</span>
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {[
          { label: "Sync FHIR Claims",    to: "/claims",  icon: "⟳", desc: "Fetch latest from FHIR R4",   color: "#6366f1" },
          { label: "Auto-Create Batches", to: "/batches", icon: "📦", desc: "Group by hospital + split",   color: "#0891b2" },
          { label: "Schedule Payments",   to: "/queue",   icon: "⏱", desc: "Add batches to FIFO queue",   color: "#7c3aed" },
          { label: "Review Errors",       to: "/errors",  icon: "⚠", desc: "Investigate problem claims",  color: "#dc2626" },
        ].map(a => (
          <button key={a.to} onClick={() => navigate(a.to)}
            style={{
              padding: "14px 16px", borderRadius: 10, border: `1.5px solid ${a.color}22`,
              background: "var(--surface)", cursor: "pointer", textAlign: "left",
              boxShadow: "var(--shadow)", transition: "transform .1s",
            }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
            onMouseLeave={e => e.currentTarget.style.transform = ""}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>{a.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: a.color }}>{a.label}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{a.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
