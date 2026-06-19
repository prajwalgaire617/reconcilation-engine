import { useEffect, useState } from "react";
import { getClaims, getHospitals, fetchFHIRClaims, createBatches, enqueueBatches } from "../api/client";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";
import Pagination from "../components/Pagination";

const fmt = (n) =>
  n == null ? "—" : "NPR " + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ── Batch-creation modal ───────────────────────────────────────────────────────
function BatchModal({ selected, claims, onClose, onDone }) {
  const selectedClaims = claims.filter(c => selected.has(c.id));
  const byHospital = {};
  selectedClaims.forEach(c => {
    if (!byHospital[c.hospital_id]) byHospital[c.hospital_id] = { name: c.hospital_name, claims: [] };
    byHospital[c.hospital_id].claims.push(c);
  });

  const [batchSize, setBatchSize]     = useState("");
  const [mode, setMode]               = useState("now");   // "now" | "queue"
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 5);
    return d.toISOString().slice(0, 16);
  });
  const [submitting, setSubmitting]   = useState(false);
  const [result, setResult]           = useState(null);

  const batchSizeNum = parseInt(batchSize) || null;

  const preview = Object.entries(byHospital).map(([hid, { name, claims: hclaims }]) => {
    const batches = batchSizeNum
      ? Math.ceil(hclaims.length / batchSizeNum)
      : 1;
    return { hid, name, claims: hclaims.length, batches, total: hclaims.reduce((s, c) => s + Number(c.amount), 0) };
  });
  const totalBatches = preview.reduce((s, h) => s + h.batches, 0);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await createBatches(
        [...selected],
        batchSizeNum,
        mode === "now",     // submit_now
      );
      if (mode === "queue" && res.batches?.length) {
        const batchIds = res.batches.map(b => b.batch_id);
        await enqueueBatches(batchIds, new Date(scheduledAt).toISOString());
      }
      setResult({ ok: true, data: res, queued: mode === "queue" });
    } catch (e) {
      setResult({ ok: false, msg: e?.response?.data?.error || "Failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.45)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "var(--surface)", borderRadius: 12, width: 540, maxHeight: "90vh",
        overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Create Payment Batches</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {selectedClaims.length} claims · {Object.keys(byHospital).length} hospital{Object.keys(byHospital).length !== 1 ? "s" : ""}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px" }}>
          {/* Batch size */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Batch size (max claims per batch)
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["", "5", "10", "25", "50"].map(v => (
                <button key={v} onClick={() => setBatchSize(v)}
                  style={{
                    padding: "6px 14px", borderRadius: 8,
                    border: `2px solid ${batchSize === v ? "var(--primary)" : "var(--border)"}`,
                    background: batchSize === v ? "var(--blue-bg)" : "var(--surface)",
                    color: batchSize === v ? "var(--primary)" : "var(--text-muted)",
                    fontWeight: 600, fontSize: 12, cursor: "pointer",
                  }}>
                  {v === "" ? "All in one" : v}
                </button>
              ))}
              <input
                type="number" min="1" placeholder="Custom"
                value={batchSize}
                onChange={e => setBatchSize(e.target.value)}
                style={{ width: 80, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}
              />
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
              Same hospital = same bank account. Each hospital's claims are split into batches of this size.
            </p>
          </div>

          {/* Preview per hospital */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              Batch preview · <span style={{ color: "var(--primary)" }}>{totalBatches} batch{totalBatches !== 1 ? "es" : ""} total</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {preview.map(h => (
                <div key={h.hid} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 12px", borderRadius: 8, background: "#f8fafc",
                  border: "1px solid var(--border)", fontSize: 13,
                }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{h.hid}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600, color: "var(--primary)" }}>
                      {h.batches} batch{h.batches !== 1 ? "es" : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {h.claims} claims · {fmt(h.total)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit mode */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Submission mode</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { key: "now",   label: "Submit now", desc: "Immediately send to NCHL gateway" },
                { key: "queue", label: "Schedule",    desc: "Add to FIFO queue with a date/time" },
              ].map(opt => (
                <button key={opt.key} onClick={() => setMode(opt.key)}
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                    border: `2px solid ${mode === opt.key ? "var(--primary)" : "var(--border)"}`,
                    background: mode === opt.key ? "var(--blue-bg)" : "var(--surface)",
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: mode === opt.key ? "var(--primary)" : "var(--text)" }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>

            {mode === "queue" && (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 5, color: "var(--text-muted)" }}>
                  Scheduled date &amp; time
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 7, border: "1.5px solid var(--primary)", fontSize: 13, width: "100%" }}
                />
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  Batches will be processed in FIFO order when you click "Execute Due" on the Queue page.
                </p>
              </div>
            )}
          </div>

          {/* Result */}
          {result && (
            <div style={{
              padding: "12px 14px", borderRadius: 8, marginBottom: 14,
              background: result.ok ? "var(--green-bg)" : "var(--red-bg)",
              color: result.ok ? "var(--green)" : "var(--red)", fontSize: 13, fontWeight: 500,
            }}>
              {result.ok
                ? result.queued
                  ? `✓ ${result.data.total_batches} batch(es) created and added to payment queue.`
                  : `✓ ${result.data.total_batches} batch(es) created. ${result.data.submitted} submitted to NCHL.`
                : `✗ ${result.msg}`}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onClose} style={{
              padding: "9px 20px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface)", fontSize: 13, cursor: "pointer",
            }}>
              {result?.ok ? "Close" : "Cancel"}
            </button>
            {!result?.ok && (
              <button onClick={handleSubmit} disabled={submitting}
                style={{
                  padding: "9px 22px", borderRadius: 8, border: "none",
                  background: submitting ? "#93c5fd" : "var(--primary)",
                  color: "#fff", fontWeight: 600, fontSize: 13,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}>
                {submitting ? "Processing…" : mode === "queue" ? "Create & Add to Queue" : "Create & Submit"}
              </button>
            )}
            {result?.ok && (
              <button onClick={() => { onDone(); onClose(); }}
                style={{ padding: "9px 22px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function ClaimsPage() {
  const [claims, setClaims]       = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [meta, setMeta]           = useState({ count: 0, page: 1, page_size: 20, total_pages: 1 });
  const [loading, setLoading]     = useState(false);
  const [syncing, setSyncing]     = useState(false);
  const [lastSync, setLastSync]   = useState(null);
  const [error, setError]         = useState(null);
  const [syncMsg, setSyncMsg]     = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected]   = useState(new Set());

  const [filterHospital, setFilterHospital] = useState("");
  const [filterStatus,   setFilterStatus]   = useState("");
  const [filterMonths,   setFilterMonths]   = useState(0);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);

  function loadData(p = page, ps = pageSize) {
    setLoading(true);
    setError(null);
    Promise.all([
      getClaims({
        hospital_id: filterHospital || undefined,
        status:      filterStatus   || undefined,
        months:      filterMonths,
        page:        p,
        page_size:   ps,
      }),
      getHospitals(),
    ])
      .then(([cd, hd]) => {
        setClaims(cd.claims || []);
        setLastSync(cd.last_sync);
        setMeta({ count: cd.count, page: cd.page, page_size: cd.page_size, total_pages: cd.total_pages });
        const seen = new Map();
        (hd || []).forEach(h => { if (!seen.has(h.hospital_id)) seen.set(h.hospital_id, h); });
        setHospitals([...seen.values()]);
        setSelected(new Set());
      })
      .catch(e => setError(e?.response?.data?.error || "Failed to load claims"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(1, pageSize); setPage(1); }, [filterHospital, filterStatus, filterMonths]);

  function handlePageChange(p) { setPage(p); loadData(p, pageSize); }
  function handlePageSizeChange(ps) { setPageSize(ps); setPage(1); loadData(1, ps); }

  async function handleSync() {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetchFHIRClaims(filterMonths);
      setSyncMsg(`✓ Fetched ${res.fetched} — Created: ${res.created}, Updated: ${res.updated}, Skipped: ${res.skipped}`);
      loadData(1, pageSize);
    } catch (e) {
      setSyncMsg(`✗ ${e?.response?.data?.error || "Sync failed"}`);
    } finally {
      setSyncing(false);
    }
  }

  function toggleAll() {
    setSelected(selected.size === claims.length ? new Set() : new Set(claims.map(c => c.id)));
  }
  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const selectedClaims = claims.filter(c => selected.has(c.id));
  const selectedTotal  = selectedClaims.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Claims</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            FHIR R4 cached claims. Sync nightly or trigger manually.
            {lastSync && <span style={{ marginLeft: 8 }}>Last sync: <strong>{new Date(lastSync).toLocaleString()}</strong></span>}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          style={{ background: syncing ? "#93c5fd" : "var(--primary)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 13, cursor: syncing ? "not-allowed" : "pointer" }}>
          {syncing ? "Syncing…" : "⟳ Sync from FHIR"}
        </button>
      </div>

      {syncMsg && (
        <div style={{
          marginBottom: 12, padding: "10px 14px", borderRadius: 7, fontSize: 13, fontWeight: 500,
          background: syncMsg.startsWith("✓") ? "var(--green-bg)" : "var(--red-bg)",
          color: syncMsg.startsWith("✓") ? "var(--green)" : "var(--red)",
        }}>{syncMsg}</div>
      )}

      {/* Status quick-filter strip */}
      {meta.count > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {[
            { label: "PENDING",   desc: "Not batched",        color: "#b45309", bg: "#fef3c7" },
            { label: "BATCHED",   desc: "In batch, queued",   color: "#2563eb", bg: "#dbeafe" },
            { label: "SUBMITTED", desc: "NCHL sent, pending", color: "#0891b2", bg: "#e0f2fe" },
            { label: "DONE",      desc: "Reconciled",         color: "#16a34a", bg: "#dcfce7" },
            { label: "ERROR",     desc: "Mismatch/failed",    color: "#dc2626", bg: "#fee2e2" },
          ].map(({ label, color, bg }) => (
            <button key={label} onClick={() => setFilterStatus(filterStatus === label ? "" : label)}
              style={{
                padding: "5px 13px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `2px solid ${filterStatus === label ? color : "transparent"}`,
                background: bg, color,
              }}>
              {label}
            </button>
          ))}
          {filterStatus && (
            <button onClick={() => setFilterStatus("")}
              style={{ padding: "5px 12px", borderRadius: 20, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
              Clear ✕
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>
            {meta.count} total
          </span>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <select value={filterHospital} onChange={e => setFilterHospital(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}>
          <option value="">All hospitals</option>
          {hospitals.map(h => (
            <option key={h.hospital_id} value={h.hospital_id}>
              {h.hospital_name} ({h.claim_count})
            </option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}>
          <option value="">All statuses</option>
          <option value="PENDING">PENDING — not batched</option>
          <option value="BATCHED">BATCHED — in queue</option>
          <option value="SUBMITTED">SUBMITTED — NCHL sent</option>
          <option value="DONE">DONE — reconciled</option>
          <option value="ERROR">ERROR — mismatch</option>
        </select>
        <select value={filterMonths} onChange={e => setFilterMonths(Number(e.target.value))}
          style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", fontSize: 13 }}>
          <option value={0}>All time</option>
          {[1, 3, 6, 12].map(m => <option key={m} value={m}>Last {m} month{m > 1 ? "s" : ""}</option>)}
        </select>
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "11px 16px", marginBottom: 14,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>
            {selected.size} selected · {fmt(selectedTotal)}
          </span>
          <button onClick={() => setShowModal(true)}
            style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: 7, padding: "8px 18px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Create Batches →
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
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
              <p style={{ fontSize: 13 }}>Sync from FHIR or adjust filters.</p>
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", width: 40 }}>
                      <input type="checkbox" checked={selected.size === claims.length && claims.length > 0} onChange={toggleAll} />
                    </th>
                    {["Claim ID", "Patient", "Hospital", "Amount", "Status", "Service Date"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: ".4px", color: "var(--text-muted)" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c, i) => (
                    <tr key={c.id} onClick={() => toggle(c.id)}
                      style={{
                        background: selected.has(c.id) ? "#eff6ff" : i % 2 === 0 ? "#fff" : "#f8fafc",
                        cursor: "pointer",
                        borderLeft: selected.has(c.id) ? "3px solid var(--primary)" : "3px solid transparent",
                      }}>
                      <td style={{ padding: "10px 14px", textAlign: "center", borderBottom: "1px solid var(--border)" }}>
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} onClick={e => e.stopPropagation()} />
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)" }}>{c.fhir_id}</td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>{c.patient_name || "—"}</td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", maxWidth: 160 }}>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{c.hospital_name}</div>
                        <div style={{ color: "var(--text-muted)", fontSize: 10 }}>{c.hospital_id}</div>
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontWeight: 600, textAlign: "right" }}>{fmt(c.amount)}</td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                        <Badge value={c.payment_status || "PENDING"} />
                      </td>
                      <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12 }}>{c.service_date || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={meta.page}
                totalPages={meta.total_pages}
                total={meta.count}
                pageSize={meta.page_size}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </div>
      )}

      {showModal && (
        <BatchModal
          selected={selected}
          claims={claims}
          onClose={() => setShowModal(false)}
          onDone={() => { loadData(1, pageSize); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
