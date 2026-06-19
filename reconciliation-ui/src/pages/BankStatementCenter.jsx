import { useRef, useState } from "react";
import { previewStatement, uploadStatement } from "../api/client";

export default function BankStatementCenter() {
  const [file, setFile]           = useState(null);
  const [type, setType]           = useState("csv");
  const [claimId, setClaimId]     = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview]     = useState(null);
  const [result, setResult]       = useState(null);
  const inputRef = useRef();

  function handleTypeChange(t) {
    setType(t);
    setClaimId("");
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
    setResult(null);
  }

  async function handleFileChange(e) {
    const f = e.target.files[0] || null;
    setFile(f);
    setPreview(null);
    setResult(null);
    if (f && type === "pdf") {
      setPreviewing(true);
      try {
        const data = await previewStatement(f, "pdf");
        setPreview(data);
      } catch (err) {
        setPreview({ error: err?.response?.data?.error || "Could not parse PDF." });
      } finally {
        setPreviewing(false);
      }
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setResult(null);
    try {
      const res = await uploadStatement(file, type, type === "pdf" ? claimId : null);
      setResult({ ok: true, data: res });
      setFile(null);
      setClaimId("");
      inputRef.current.value = "";
    } catch (e) {
      setResult({ ok: false, msg: e?.response?.data?.error || "Upload failed" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ padding: "22px 28px", maxWidth: 860 }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px", color: "var(--text-muted)", marginBottom: 4 }}>
          Bank Statements
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-.02em" }}>
          Bank Statement Center
        </h1>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Import settlement files from NCHL or Connect IPS for reconciliation
        </div>
      </div>

      {result && (
        <div style={{
          padding: "10px 14px", borderRadius: 6, marginBottom: 16, fontSize: 12,
          background: result.ok ? "var(--green-bg)" : "var(--red-bg)",
          border: `1px solid ${result.ok ? "var(--green-border)" : "var(--red-border)"}`,
          color: result.ok ? "var(--green)" : "var(--red)",
        }}>
          {result.ok
            ? `✓ Imported ${result.data.rows_imported} row${result.data.rows_imported !== 1 ? "s" : ""} (batch: ${result.data.import_batch}). Run reconciliation to update results.`
            : `✗ ${result.msg}`}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        {/* Upload card */}
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Import Statement</div>
          </div>
          <div style={{ padding: "20px 18px" }}>
            {/* Type selector */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 8 }}>
                File Format
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["csv", "pdf"].map(t => (
                  <button
                    key={t}
                    onClick={() => handleTypeChange(t)}
                    style={{
                      padding: "6px 18px", borderRadius: 5,
                      border: `1.5px solid ${type === t ? "var(--primary)" : "var(--border)"}`,
                      background: type === t ? "var(--blue-bg)" : "#fff",
                      color: type === t ? "var(--primary)" : "var(--text-muted)",
                      fontWeight: 700, fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                {type === "csv" ? "NCHL batch settlement file with claim_id column" : "Connect IPS payment receipt slip (PDF)"}
              </div>
            </div>

            {/* Claim ID for PDF */}
            {type === "pdf" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
                  Claim ID <span style={{ color: "var(--red)" }}>*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 101"
                  value={claimId}
                  onChange={e => setClaimId(e.target.value)}
                  style={{
                    width: "100%", padding: "7px 10px", borderRadius: 5,
                    border: "1px solid var(--border)", fontSize: 12,
                    outline: "none",
                  }}
                />
                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>
                  Connect IPS receipts don't include a claim ID — enter the matching claim.
                </div>
              </div>
            )}

            {/* File input */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 8 }}>
                File
              </div>
              <div style={{
                border: "2px dashed var(--border)", borderRadius: 6,
                padding: "20px", textAlign: "center",
                background: "var(--surface-raised)",
              }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: .4 }}>⊟</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                  {file ? <strong>{file.name}</strong> : `Select ${type.toUpperCase()} file`}
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={type === "csv" ? ".csv" : ".pdf"}
                  onChange={handleFileChange}
                  style={{ fontSize: 12 }}
                />
              </div>
            </div>

            {previewing && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>Reading PDF…</div>
            )}

            {preview?.error && (
              <div style={{ padding: "8px 12px", borderRadius: 5, background: "var(--red-bg)", color: "var(--red)", fontSize: 12, marginBottom: 12, border: "1px solid var(--red-border)" }}>
                {preview.error}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              style={{
                width: "100%", padding: "9px", borderRadius: 6,
                border: "none",
                background: uploading || !file ? "#93c5fd" : "var(--primary)",
                color: "#fff", fontWeight: 700, fontSize: 13,
                cursor: uploading || !file ? "not-allowed" : "pointer",
              }}
            >
              {uploading ? "Uploading…" : "Import Statement"}
            </button>
          </div>
        </div>

        {/* Right panel: format spec + PDF preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Format guide */}
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", background: "var(--surface-raised)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                {type === "csv" ? "CSV Format Requirements" : "PDF (Connect IPS) Details"}
              </div>
            </div>
            <div style={{ padding: "16px" }}>
              {type === "csv" ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--text-muted)", marginBottom: 8 }}>
                    Required columns
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                    {["claim_id", "transaction_id", "amount", "status", "settlement_date"].map(col => (
                      <code key={col} style={{
                        background: "var(--blue-bg)", color: "var(--blue)",
                        borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
                      }}>{col}</code>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    Date formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY<br />
                    Status values: <code style={{ fontSize: 10 }}>SUCCESS</code> or <code style={{ fontSize: 10 }}>FAILED</code>
                  </div>
                  <pre style={{
                    marginTop: 12, background: "#0f172a", color: "#e2e8f0",
                    borderRadius: 6, padding: "12px 14px", fontSize: 10,
                    lineHeight: 1.7, overflowX: "auto",
                  }}>
{`claim_id,transaction_id,amount,status,settlement_date
101,TXN-00001,5000.00,SUCCESS,2026-06-18
102,TXN-00002,12500.00,FAILED,2026-06-18`}
                  </pre>
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
                  <p>Extracted fields from Connect IPS payment receipt:</p>
                  <ul style={{ paddingLeft: 16, marginTop: 8 }}>
                    {["Transaction ID", "Amount + Charge Amount", "Status (SUCCESS/FAILED)", "Settlement Date", "Sender & Beneficiary", "Bank & Branch", "Account Number"].map(f => (
                      <li key={f} style={{ marginBottom: 4 }}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Connect IPS PDF preview */}
          {preview && !preview.error && preview.format === "connect_ips" && (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", boxShadow: "var(--shadow-xs)" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "#1d4ed8", color: "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>Connect IPS — Extracted Data</div>
              </div>
              <div style={{ padding: "14px 16px" }}>
                {[
                  ["Transaction ID",  preview.transaction_id],
                  ["Amount",         `NPR ${preview.amount}`],
                  ["Charge Amount",  `NPR ${preview.charge_amount}`],
                  ["Status",          preview.status],
                  ["Settlement Date", preview.settlement_date],
                  ["Sender",          preview.sender_name],
                  ["Bank",            preview.bank_name],
                  ["Branch",          preview.bank_branch],
                  ["Account No.",     preview.account_number],
                  ["Beneficiary",     preview.beneficiary_name],
                ].filter(([, v]) => v).map(([label, val]) => (
                  <div key={label} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "6px 0", borderBottom: "1px solid var(--border-subtle)",
                    fontSize: 12, gap: 12,
                  }}>
                    <span style={{ color: "var(--text-muted)" }}>{label}</span>
                    <span style={{
                      fontWeight: 600, textAlign: "right",
                      color: label === "Status" ? (val === "SUCCESS" ? "var(--green)" : "var(--red)") : "var(--text)",
                    }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
