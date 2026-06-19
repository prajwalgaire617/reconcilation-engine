import { useRef, useState } from "react";
import { previewStatement, uploadStatement } from "../api/client";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [type, setType] = useState("csv");
  const [claimId, setClaimId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
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
    <div style={{ padding: "28px 32px", maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Upload Bank Statement</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 28 }}>
        Import the bank's settlement file. Supported formats: <strong>CSV</strong> and <strong>PDF</strong>.
        After upload, run reconciliation to see updated results.
      </p>

      {/* Expected format */}
      <div style={{
        background: "#f8fafc", border: "1px solid var(--border)",
        borderRadius: "var(--radius)", padding: "16px 20px", marginBottom: 24,
      }}>
        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Required columns</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["claim_id", "transaction_id", "amount", "status", "settlement_date"].map(col => (
            <code key={col} style={{
              background: "var(--blue-bg)", color: "var(--blue)",
              borderRadius: 5, padding: "3px 8px", fontSize: 12, fontWeight: 600,
            }}>{col}</code>
          ))}
        </div>
        <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
          Date format: YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY. Status must be SUCCESS or FAILED.
        </p>
      </div>

      {/* Upload form */}
      <div style={{
        background: "var(--surface)", border: "2px dashed var(--border)",
        borderRadius: "var(--radius)", padding: "32px 28px", boxShadow: "var(--shadow)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>↑</div>
        <p style={{ fontWeight: 600, marginBottom: 16 }}>Choose a statement file to upload</p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
          {["csv", "pdf"].map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              style={{
                padding: "7px 20px", borderRadius: 20,
                border: `2px solid ${type === t ? "var(--primary)" : "var(--border)"}`,
                background: type === t ? "var(--blue-bg)" : "var(--surface)",
                color: type === t ? "var(--primary)" : "var(--text-muted)",
                fontWeight: 600, fontSize: 13, cursor: "pointer",
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {type === "pdf" && (
          <div style={{ marginBottom: 16, textAlign: "left", maxWidth: 340, margin: "0 auto 16px" }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
              Claim ID <span style={{ color: "var(--red)", fontWeight: 700 }}>*</span>
              <span style={{ fontWeight: 400, marginLeft: 6 }}>(required for Connect IPS slips)</span>
            </label>
            <input
              type="number"
              min="1"
              placeholder="e.g. 101"
              value={claimId}
              onChange={e => setClaimId(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 7,
                border: "1.5px solid var(--border)", fontSize: 13,
                outline: "none", boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Connect IPS receipts don't contain a Claim ID — enter the matching claim manually.
              Leave blank for tabular PDF statements that already include a claim_id column.
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={type === "csv" ? ".csv" : ".pdf"}
          onChange={handleFileChange}
          style={{ marginBottom: 16, fontSize: 13 }}
        />

        {file && (
          <div style={{ marginBottom: 14, fontSize: 13, color: "var(--text-muted)" }}>
            Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
          </div>
        )}

        {previewing && (
          <div style={{ marginBottom: 14, fontSize: 13, color: "var(--text-muted)" }}>
            Reading PDF…
          </div>
        )}

        {preview && !preview.error && preview.format === "connect_ips" && (
          <div style={{
            margin: "0 auto 18px", maxWidth: 480, textAlign: "left",
            background: "var(--surface)", border: "1.5px solid var(--border)",
            borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow)",
          }}>
            <div style={{
              background: "var(--primary)", color: "#fff",
              padding: "10px 16px", fontWeight: 700, fontSize: 13, letterSpacing: 0.3,
            }}>
              Connect IPS — Payment Transaction Details
            </div>
            <div style={{ padding: "14px 16px" }}>
              {[
                ["Transaction ID",  preview.transaction_id],
                ["Amount",          `NPR ${preview.amount}`],
                ["Charge Amount",   `NPR ${preview.charge_amount}`],
                ["Status",          preview.status],
                ["Settlement Date", preview.settlement_date],
                ["Sender",         preview.sender_name],
                ["Bank",           preview.bank_name],
                ["Branch",         preview.bank_branch],
                ["Account No.",    preview.account_number],
                ["Beneficiary",    preview.beneficiary_name],
              ].map(([label, val]) => val ? (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: "1px solid var(--border)",
                  fontSize: 13, gap: 12,
                }}>
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
                  <span style={{
                    fontWeight: 600, textAlign: "right",
                    color: label === "Status"
                      ? (val === "SUCCESS" ? "var(--green)" : "var(--red)")
                      : "var(--text)",
                  }}>{val}</span>
                </div>
              ) : null)}
            </div>
          </div>
        )}

        {preview?.error && (
          <div style={{ marginBottom: 14, fontSize: 13, color: "var(--red)" }}>
            {preview.error}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !file}
          style={{
            background: uploading || !file ? "#93c5fd" : "var(--primary)",
            color: "#fff", border: "none", borderRadius: 8,
            padding: "10px 28px", fontWeight: 600, fontSize: 14, cursor: uploading || !file ? "not-allowed" : "pointer",
          }}
        >
          {uploading ? "Uploading…" : "Upload Statement"}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: 18, padding: "14px 18px", borderRadius: 8,
          background: result.ok ? "var(--green-bg)" : "var(--red-bg)",
          color: result.ok ? "var(--green)" : "var(--red)",
          fontWeight: 500, fontSize: 13,
        }}>
          {result.ok
            ? `✓ Imported ${result.data.rows_imported} ${result.data.rows_imported === 1 ? "row" : "rows"} (batch: ${result.data.import_batch}). Now run reconciliation to update results.`
            : `✗ ${result.msg}`}
        </div>
      )}

      {/* Sample CSV preview */}
      <div style={{ marginTop: 28 }}>
        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Sample CSV format</p>
        <pre style={{
          background: "#0f172a", color: "#e2e8f0", borderRadius: 8,
          padding: "16px 18px", fontSize: 12, lineHeight: 1.7, overflowX: "auto",
        }}>
{`claim_id,transaction_id,amount,status,settlement_date
101,TXN-00001,5000.00,SUCCESS,2026-06-18
102,TXN-00002,12500.00,FAILED,2026-06-18
103,TXN-00003,8750.00,SUCCESS,2026-06-18`}
        </pre>
      </div>
    </div>
  );
}
