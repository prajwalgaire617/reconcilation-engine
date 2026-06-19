import { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { getDashboard, runReconciliation } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";

const RESULT_COLORS = {
  Matched:                "#16a34a",
  "Settlement Pending":   "#d97706",
  "Status Mismatch":      "#dc2626",
  "Investigation Req.":   "#ea580c",
  "Amount Mismatch":      "#7c3aed",
  "Not Sent":             "#64748b",
};

const fmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function DashboardPage() {
  const { data, loading, error, reload } = useFetch(getDashboard);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await runReconciliation();
      setRunResult({ ok: true, data: res });
      reload();
    } catch (e) {
      setRunResult({ ok: false, msg: e?.response?.data?.error || "Failed" });
    } finally {
      setRunning(false);
    }
  }

  const pieData = data ? [
    { name: "Matched",              value: data.successful_payments },
    { name: "Settlement Pending",   value: data.pending_settlements },
    { name: "Status Mismatch",      value: data.failed_payments - data.amount_mismatches },
    { name: "Amount Mismatch",      value: data.amount_mismatches },
  ].filter(d => d.value > 0) : [];

  const barData = data ? [
    { name: "Successful", value: data.successful_payments, fill: "#16a34a" },
    { name: "Failed",     value: data.failed_payments,     fill: "#dc2626" },
    { name: "Pending",    value: data.pending_settlements, fill: "#d97706" },
    { name: "Retried",    value: data.retry_count,         fill: "#7c3aed" },
  ] : [];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            Reconciliation Dashboard
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Real-time payment reconciliation status across SOSYS and bank statement.
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            background: running ? "#93c5fd" : "var(--primary)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 22px",
            fontWeight: 600,
            fontSize: 13.5,
            cursor: running ? "not-allowed" : "pointer",
            boxShadow: "var(--shadow-md)",
            transition: "background .15s",
          }}
        >
          {running ? "Running…" : "⟳  Run Reconciliation"}
        </button>
      </div>

      {runResult && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 20,
          background: runResult.ok ? "var(--green-bg)" : "var(--red-bg)",
          color: runResult.ok ? "var(--green)" : "var(--red)",
          fontWeight: 500,
          fontSize: 13,
        }}>
          {runResult.ok
            ? `✓ Reconciliation complete — ${runResult.data.total_claims} claims processed`
            : `✗ ${runResult.msg}`}
        </div>
      )}

      {loading && <Spinner />}
      {error && <p style={{ color: "var(--red)", padding: 16 }}>Error: {error}</p>}

      {data && (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
            <StatCard label="Total Claims"    value={data.total_claims}       accent="#2563eb" />
            <StatCard label="Total Amount"    value={fmt(data.total_amount)}  accent="#0891b2" sub="all batches" />
            <StatCard label="Matched"         value={data.successful_payments} accent="#16a34a" sub={`${data.reconciliation_rate}% rate`} />
            <StatCard label="Failed / Issues" value={data.failed_payments}    accent="#dc2626" />
            <StatCard label="Pending Bank"    value={data.pending_settlements} accent="#d97706" />
            <StatCard label="Amt Mismatches"  value={data.amount_mismatches}  accent="#7c3aed" />
            <StatCard label="Retry Batches"   value={data.retry_count}        accent="#64748b" />
          </div>

          {/* Charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            {/* Pie */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 16px", boxShadow: "var(--shadow)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, paddingLeft: 4 }}>Reconciliation Outcomes</h3>
              {pieData.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 32 }}>Run reconciliation to see data</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={RESULT_COLORS[entry.name] || "#94a3b8"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                    <Legend iconType="circle" iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Bar */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 16px", boxShadow: "var(--shadow)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, paddingLeft: 4 }}>Claims by Status</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Reconciliation rate progress bar */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px", boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Reconciliation Rate</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: data.reconciliation_rate >= 80 ? "var(--green)" : data.reconciliation_rate >= 50 ? "var(--yellow)" : "var(--red)" }}>
                {data.reconciliation_rate}%
              </span>
            </div>
            <div style={{ background: "var(--border)", borderRadius: 99, height: 10, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${data.reconciliation_rate}%`,
                background: data.reconciliation_rate >= 80 ? "#16a34a" : data.reconciliation_rate >= 50 ? "#d97706" : "#dc2626",
                borderRadius: 99,
                transition: "width 0.5s ease",
              }} />
            </div>
            <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
              {data.successful_payments} of {data.total_claims} claims fully matched with bank statement
            </p>
          </div>
        </>
      )}
    </div>
  );
}
