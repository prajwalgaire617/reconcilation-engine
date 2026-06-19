import { useState } from "react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { getDashboard, runReconciliation } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";

// Map reconciliation engine results → payment domain status
const PIE_DATA_FROM = (data) => [
  { name: "DONE",    value: data.successful_payments, color: "#16a34a" },
  { name: "PENDING", value: data.pending_settlements, color: "#d97706" },
  { name: "ERROR",   value: data.failed_payments,     color: "#dc2626" },
].filter(d => d.value > 0);

const BAR_DATA_FROM = (data) => [
  { name: "Done",    value: data.successful_payments, fill: "#16a34a" },
  { name: "Pending", value: data.pending_settlements, fill: "#d97706" },
  { name: "Error",   value: data.failed_payments,     fill: "#dc2626" },
  { name: "Retried", value: data.retry_count,         fill: "#7c3aed" },
];

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

  const pieData = data ? PIE_DATA_FROM(data) : [];
  const barData = data ? BAR_DATA_FROM(data) : [];

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>
            Payment Reconciliation
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Automated comparison of NCHL gateway responses with bank statement.
            Bank statement is the source of truth.
          </p>
        </div>
        <button
          onClick={handleRun} disabled={running}
          style={{
            background: running ? "#93c5fd" : "var(--primary)", color: "#fff",
            border: "none", borderRadius: 8, padding: "10px 22px",
            fontWeight: 600, fontSize: 13.5, cursor: running ? "not-allowed" : "pointer",
            boxShadow: "var(--shadow-md)", transition: "background .15s",
          }}
        >
          {running ? "Running…" : "⟳  Run Reconciliation"}
        </button>
      </div>

      {runResult && (
        <div style={{
          padding: "12px 16px", borderRadius: 8, marginBottom: 20,
          background: runResult.ok ? "var(--green-bg)" : "var(--red-bg)",
          color: runResult.ok ? "var(--green)" : "var(--red)",
          fontWeight: 500, fontSize: 13,
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
          {/* Stat cards — payment domain language */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 32 }}>
            <StatCard
              label="Total Claims"
              value={data.total_claims}
              accent="#2563eb"
              sub="reconciled"
            />
            <StatCard
              label="Total Amount"
              value={fmt(data.total_amount)}
              accent="#0891b2"
              sub="across all batches"
            />
            <StatCard
              label="DONE"
              value={data.successful_payments}
              accent="#16a34a"
              sub="bank confirmed"
            />
            <StatCard
              label="PENDING"
              value={data.pending_settlements}
              accent="#d97706"
              sub="awaiting bank settlement"
            />
            <StatCard
              label="ERROR"
              value={data.failed_payments}
              accent="#dc2626"
              sub="needs attention"
            />
            <StatCard
              label="Amt Mismatch"
              value={data.amount_mismatches}
              accent="#7c3aed"
              sub="bank vs gateway differ"
            />
            <StatCard
              label="Retry Batches"
              value={data.retry_count}
              accent="#64748b"
              sub="re-submitted"
            />
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 32 }}>
            {/* Pie — payment status breakdown */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 16px", boxShadow: "var(--shadow)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, paddingLeft: 4 }}>Payment Status Breakdown</h3>
              <p style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 4, marginBottom: 14 }}>
                Based on bank statement reconciliation
              </p>
              {pieData.length === 0 ? (
                <p style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                  Run reconciliation to see data
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label={({ name, percent }) =>
                        percent > 0.03 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                      }
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v + " claims", n]} />
                    <Legend iconType="circle" iconSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Bar — count by status */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 16px", boxShadow: "var(--shadow)" }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, paddingLeft: 4 }}>Claims by Payment Status</h3>
              <p style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 4, marginBottom: 14 }}>
                DONE · PENDING · ERROR · Retried
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => [v + " claims"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Completion rate */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px 24px", boxShadow: "var(--shadow)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Payment Completion Rate</span>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  % of reconciled claims confirmed DONE by bank statement
                </p>
              </div>
              <span style={{
                fontWeight: 800, fontSize: 22,
                color: data.reconciliation_rate >= 80 ? "var(--green)"
                     : data.reconciliation_rate >= 50 ? "var(--yellow)"
                     : "var(--red)",
              }}>
                {data.reconciliation_rate}%
              </span>
            </div>
            <div style={{ background: "var(--border)", borderRadius: 99, height: 12, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${data.reconciliation_rate}%`,
                background: data.reconciliation_rate >= 80 ? "#16a34a"
                          : data.reconciliation_rate >= 50 ? "#d97706"
                          : "#dc2626",
                borderRadius: 99,
                transition: "width 0.6s ease",
              }} />
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 20, fontSize: 12, color: "var(--text-muted)" }}>
              <span style={{ color: "#16a34a", fontWeight: 600 }}>✓ {data.successful_payments} DONE</span>
              <span style={{ color: "#d97706", fontWeight: 600 }}>◷ {data.pending_settlements} PENDING</span>
              <span style={{ color: "#dc2626", fontWeight: 600 }}>✗ {data.failed_payments} ERROR</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
