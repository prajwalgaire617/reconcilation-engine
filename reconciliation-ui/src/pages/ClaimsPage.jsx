import { useEffect, useState } from "react";
import { getClaims, getHospitals, fetchFHIRClaims, createBatches } from "../api/client";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";

const fmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Payment status descriptions shown as tooltips / legend
const PAYMENT_STATUS_DESC = {
  PENDING: "Awaiting payment submission or bank settlement confirmation.",
  DONE:    "Bank statement has confirmed this payment.",
  ERROR:   "Bank statement shows a mismatch or missing record — needs review.",
};

function PaymentStatusLegend() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      {Object.entries(PAYMENT_STATUS_DESC).map(([s, desc]) => (
        <div key={s} style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "6px 12px", fontSize: 12,
        }}>
          <Badge value={s} />
          <span style={{ color: "var(--text-muted)" }}>{desc}</span>
        </div>
      ))}
    </div>
  );
}

function BatchResultPanel({ result, onClose }) {
  if (!result) return null;
  return (
    <div style={{
      background: "var(--surface)", border: "1.5px solid var(--border)",
      borderRadius: "var(--radius)", padding: "18px 20px", marginBottom: 20,
      boxShadow: "var(--shadow)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          Batch Created — {result.total_batches} batch{result.total_batches !== 1 ? "es" : ""}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ Submitted to NCHL: {result.submitted}</span>
        {result.failed > 0 && (
          <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 600 }}>✗ Gateway unavailable: {result.failed}</span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {result.batches.map((b) => (
          <div key={b.batch_id} style={{
            padding: "10px 14px", borderRadius: 8,
            background: b.status === "SUBMITTED" ? "#f0fdf4" : "#fff8f8",
            border: `1px solid ${b.status === "SUBMITTED" ? "#bbf7d0" : "#fecaca"}`,
            fontSize: 13,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <span style={{ fontWeight: 600 }}>{b.hospital_name}</span>
              <Badge value={b.status} />
            </div>
            <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
              Batch #{b.batch_id} · {b.claim_count} claims · {fmt(b.total_amount)}
              {b.failure_reason && (
                <span style={{ color: "#dc2626", marginLeft: 8 }}>— {b.failure_reason}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {result.failed > 0 && (
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)" }}>
          Failed batches are stored as <Badge value="PENDING" /> and can be retried from <strong>Errors &amp; Retries</strong>.
        </p>
      )}
    </div>
  );
}

export default function ClaimsPage() {
  const [claims, setClaims]         = useState([]);
  const [hospitals, setHospitals]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [creating, setCreating]     = useState(false);
  const [lastSync, setLastSync]     = useState(null);
  const [error, setError]           = useState(null);
  const [syncMsg, setSyncMsg]       = useState(null);
  const [batchResult, setBatchResult] = useState(null);

  const [filterHospital, setFilterHospital] = useState("");
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterMonths, setFilterMonths]     = useState(3);
  const [selected, setSelected] = useState(new Set());

  function loadData() {
    setLoading(true);
    setError(null);
    Promise.all([
      getClaims({ hospital_id: filterHospital || undefined, status: filterStatus || undefined, months: filterMonths }),
      getHospitals(),
    ])
      .then(([claimsData, hospData]) => {
        setClaims(claimsData.claims || []);
        setLastSync(claimsData.last_sync);
        // Deduplicate by hospital_id (safety net if backend returns dupes)
        const seen = new Map();
        (hospData || []).forEach(h => { if (!seen.has(h.hospital_id)) seen.set(h.hospital_id, h); });
        setHospitals([...seen.values()]);
        setSelected(new Set());
      })
      .catch(e => setError(e?.response?.data?.error || "Failed to load claims"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, [filterHospital, filterStatus, filterMonths]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetchFHIRClaims(filterMonths);
      setSyncMsg(`✓ Fetched ${res.fetched} claims — Created: ${res.created}, Updated: ${res.updated}, Skipped: ${res.skipped}`);
      loadData();
    } catch (e) {
      setSyncMsg(`✗ ${e?.response?.data?.error || "FHIR sync failed"}`);
    } finally {
      setSyncing(false);
    }
  }

  async function handleCreateBatches() {
    if (selected.size === 0) return;
    setCreating(true);
    setBatchResult(null);
    try {
      const res = await createBatches([...selected]);
      setBatchResult(res);
      setSelected(new Set());
      loadData();
    } catch (e) {
      setBatchResult({ error: e?.response?.data?.error || "Batch creation failed" });
    } finally {
      setCreating(false);
    }
  }

  function toggleAll() {
    setSelected(selected.size === claims.length ? new Set() : new Set(claims.map(c => c.id)));
  }

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedClaims = claims.filter(c => selected.has(c.id));
  const selectedTotal  = selectedClaims.reduce((s, c) => s + Number(c.amount), 0);
  const hospitalGroups = [...new Set(selectedClaims.map(c => c.hospital_id))].length;

  const pendingCount = claims.filter(c => c.payment_status === "PENDING").length;
  const doneCount    = claims.filter(c => c.payment_status === "DONE").length;
  const errorCount   = claims.filter(c => c.payment_status === "ERROR").length;

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Claims</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Locally cached claims from FHIR R4. Sync nightly or trigger manually.
            {lastSync && <span style={{ marginLeft: 8 }}>Last sync: <strong>{new Date(lastSync).toLocaleString()}</strong></span>}
          </p>
        </div>
        <button
          onClick={handleSync} disabled={syncing}
          style={{
            background: syncing ? "#93c5fd" : "var(--primary)", color: "#fff",
            border: "none", borderRadius: 8, padding: "9px 18px",
            fontWeight: 600, fontSize: 13, cursor: syncing ? "not-allowed" : "pointer",
          }}
        >
          {syncing ? "Syncing…" : "⟳ Sync from FHIR"}
        </button>
      </div>

      {syncMsg && (
        <div style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500,
          background: syncMsg.startsWith("✓") ? "var(--green-bg)" : "var(--red-bg)",
          color: syncMsg.startsWith("✓") ? "var(--green)" : "var(--red)",
        }}>{syncMsg}</div>
      )}

      {/* Status summary strip */}
      {claims.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "PENDING", count: pendingCount, color: "#b45309", bg: "#fef3c7" },
            { label: "DONE",    count: doneCount,    color: "#16a34a", bg: "#dcfce7" },
            { label: "ERROR",   count: errorCount,   color: "#dc2626", bg: "#fee2e2" },
          ].map(({ label, count, color, bg }) => (
            <button
              key={label}
              onClick={() => setFilterStatus(filterStatus === label ? "" : label)}
              style={{
                padding: "6px 14px", borderRadius: 20, border: `2px solid ${filterStatus === label ? color : "transparent"}`,
                background: bg, color, fontWeight: 700, fontSize: 12, cursor: "pointer",
              }}
            >
              {label} · {count}
            </button>
          ))}
          {filterStatus && (
            <button onClick={() => setFilterStatus("")} style={{
              padding: "6px 12px", borderRadius: 20, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
            }}>
              Clear filter ✕
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, alignItems: "center" }}>
        <select
          value={filterHospital}
          onChange={e => setFilterHospital(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}
        >
          <option value="">All hospitals</option>
          {hospitals.map(h => (
            // hospital_id is guaranteed unique after dedup; use it as key
            <option key={h.hospital_id} value={h.hospital_id}>
              {h.hospital_name} ({h.claim_count})
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}
        >
          <option value="">All payment statuses</option>
          <option value="PENDING">PENDING — awaiting settlement</option>
          <option value="DONE">DONE — bank confirmed</option>
          <option value="ERROR">ERROR — needs attention</option>
        </select>

        <select
          value={filterMonths}
          onChange={e => setFilterMonths(Number(e.target.value))}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}
        >
          {[1, 3, 6, 12].map(m => (
            <option key={m} value={m}>Last {m} month{m > 1 ? "s" : ""}</option>
          ))}
        </select>

        <span style={{ fontSize: 13, color: "var(--text-muted)", marginLeft: "auto" }}>
          {claims.length} claims
        </span>
      </div>

      {/* Batch result panel */}
      {batchResult && !batchResult.error && (
        <BatchResultPanel result={batchResult} onClose={() => setBatchResult(null)} />
      )}
      {batchResult?.error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "var(--red-bg)", color: "var(--red)", fontSize: 13, marginBottom: 16 }}>
          ✗ {batchResult.error}
        </div>
      )}

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          background: "#eff6ff", border: "1.5px solid #bfdbfe",
          borderRadius: 8, padding: "12px 16px", marginBottom: 16,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
            {selected.size} claim{selected.size > 1 ? "s" : ""} selected
            · {fmt(selectedTotal)}
            · {hospitalGroups} batch{hospitalGroups !== 1 ? "es" : ""} (1 per hospital)
          </span>
          <button
            onClick={handleCreateBatches} disabled={creating}
            style={{
              background: creating ? "#93c5fd" : "var(--primary)", color: "#fff",
              border: "none", borderRadius: 7, padding: "8px 18px",
              fontWeight: 600, fontSize: 13, cursor: creating ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "Creating…" : "Submit to NCHL"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}
          >
            Clear
          </button>
        </div>
      )}

      {loading && <Spinner />}
      {error && <p style={{ color: "var(--red)" }}>Error: {error}</p>}

      {!loading && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
          {claims.length === 0 ? (
            <div style={{ padding: "48px 32px", textAlign: "center", color: "var(--text-muted)" }}>
              <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No claims</p>
              <p style={{ fontSize: 13 }}>Click <strong>Sync from FHIR</strong> to fetch claims, or clear the active filter.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid var(--border)", width: 40 }}>
                    <input type="checkbox" checked={selected.size === claims.length && claims.length > 0} onChange={toggleAll} />
                  </th>
                  {["Claim ID", "Patient", "Hospital", "Amount", "Payment Status", "Service Date"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {claims.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => toggle(c.id)}
                    style={{
                      background: selected.has(c.id) ? "#eff6ff" : i % 2 === 0 ? "#fff" : "#f8fafc",
                      cursor: "pointer",
                      borderLeft: selected.has(c.id) ? "3px solid var(--primary)" : "3px solid transparent",
                    }}
                  >
                    <td style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} onClick={e => e.stopPropagation()} />
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                      {c.fhir_id}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      {c.patient_name || <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", maxWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{c.hospital_name}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{c.hospital_id}</div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, textAlign: "right" }}>
                      {fmt(c.amount)}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                      <Badge value={c.payment_status || "PENDING"} />
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
                      {c.service_date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-muted)" }}>
        <strong>How it works:</strong> Select claims → one batch per hospital → submitted to NCHL gateway →
        upload bank statement → run reconciliation → status updates to <Badge value="DONE" /> or <Badge value="ERROR" />.
      </div>
    </div>
  );
}
