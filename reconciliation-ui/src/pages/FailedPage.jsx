import { useState } from "react";
import { getFailed, retryBatch } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import Table from "../components/Table";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";

const fmt = (v) => v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN");

const COLUMNS = [
  { key: "claim_id",       label: "Claim ID", align: "center" },
  { key: "result",         label: "Issue",    render: (v) => <Badge value={v} /> },
  { key: "gateway_status", label: "Gateway",  render: (v) => v ? <Badge value={v} /> : "—" },
  { key: "bank_status",    label: "Bank",     render: (v) => v ? <Badge value={v} /> : "—" },
  { key: "gateway_amount", label: "Gateway Amt", align: "right", render: fmt },
  { key: "bank_amount",    label: "Bank Amt",    align: "right", render: fmt },
  {
    key: "gateway_amount",
    label: "Variance",
    align: "right",
    render: (_, row) => {
      if (!row.gateway_amount || !row.bank_amount) return "—";
      const diff = Number(row.bank_amount) - Number(row.gateway_amount);
      const color = diff < 0 ? "var(--red)" : diff > 0 ? "var(--orange)" : "var(--green)";
      return <span style={{ color, fontWeight: 600 }}>{diff >= 0 ? "+" : ""}{fmt(diff)}</span>;
    },
  },
  { key: "reason", label: "Reason", render: (v) => <span style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>{v || "—"}</span> },
];

const ISSUE_DESCRIPTIONS = {
  STATUS_MISMATCH:        "Gateway reported success but bank rejected. Investigate with bank.",
  INVESTIGATION_REQUIRED: "Gateway failed but bank paid. Risk of double payment — freeze immediately.",
  AMOUNT_MISMATCH:        "Amounts differ between gateway and bank. Partial settlement likely.",
  NOT_SENT:               "No gateway record. Claim was never submitted to NCHL.",
};

export default function FailedPage() {
  const { data, loading, error, reload } = useFetch(getFailed);
  const [batchId, setBatchId] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState(null);

  async function handleRetry() {
    if (!batchId) return;
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await retryBatch(Number(batchId));
      setRetryResult({ ok: true, data: res });
      reload();
    } catch (e) {
      setRetryResult({ ok: false, msg: e?.response?.data?.error || "Retry failed" });
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Problem Claims</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Claims requiring manual action or retry. Bank statement is the source of truth.
      </p>

      {/* Issue legend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, marginBottom: 24 }}>
        {Object.entries(ISSUE_DESCRIPTIONS).map(([key, desc]) => (
          <div key={key} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 14px", boxShadow: "var(--shadow)",
          }}>
            <Badge value={key} />
            <p style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* Retry panel */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", padding: "18px 20px", marginBottom: 20,
        boxShadow: "var(--shadow)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Retry failed items in a batch:</span>
        <input
          type="number"
          placeholder="Batch ID"
          value={batchId}
          onChange={e => setBatchId(e.target.value)}
          style={{ padding: "7px 12px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13, width: 110 }}
        />
        <button
          onClick={handleRetry}
          disabled={retrying || !batchId}
          style={{
            background: retrying || !batchId ? "#93c5fd" : "var(--primary)",
            color: "#fff", border: "none", borderRadius: 7,
            padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}
        >
          {retrying ? "Retrying…" : "Create Retry Batch"}
        </button>
        {retryResult && (
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: retryResult.ok ? "var(--green)" : "var(--red)",
          }}>
            {retryResult.ok
              ? `✓ Retry batch #${retryResult.data.retry_batch_id} created (${retryResult.data.retried_claim_ids.length} claims)`
              : `✗ ${retryResult.msg}`}
          </span>
        )}
      </div>

      {loading && <Spinner />}
      {error && <p style={{ color: "var(--red)" }}>Error: {error}</p>}

      {data && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", background: data.length > 0 ? "#fff8f8" : undefined }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: data.length > 0 ? "var(--red)" : "var(--green)" }}>
              {data.length > 0 ? `⚠  ${data.length} claim(s) require attention` : "✓ No problem claims"}
            </span>
          </div>
          <Table columns={COLUMNS} rows={data} emptyText="No problem claims — all matched!" />
        </div>
      )}
    </div>
  );
}
