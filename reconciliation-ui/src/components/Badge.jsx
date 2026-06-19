const STYLES = {
  // Payment domain statuses (ClaimsPage, Dashboard)
  DONE:                   { color: "#16a34a", bg: "#dcfce7" },
  PENDING:                { color: "#b45309", bg: "#fef3c7" },
  ERROR:                  { color: "#dc2626", bg: "#fee2e2" },

  // Reconciliation engine outcomes (Results / Failed pages)
  MATCHED:                { color: "#16a34a", bg: "#dcfce7" },
  SETTLEMENT_PENDING:     { color: "#b45309", bg: "#fef3c7" },
  STATUS_MISMATCH:        { color: "#dc2626", bg: "#fee2e2" },
  INVESTIGATION_REQUIRED: { color: "#ea580c", bg: "#ffedd5" },
  AMOUNT_MISMATCH:        { color: "#7c3aed", bg: "#ede9fe" },
  NOT_SENT:               { color: "#475569", bg: "#f1f5f9" },

  // Batch / item statuses
  SUCCESS:                { color: "#16a34a", bg: "#dcfce7" },
  FAILED:                 { color: "#dc2626", bg: "#fee2e2" },
  SUBMITTED:              { color: "#2563eb", bg: "#dbeafe" },
};

export default function Badge({ value }) {
  const s = STYLES[value] || { color: "#475569", bg: "#f1f5f9" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 9px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".3px",
      color: s.color,
      background: s.bg,
      whiteSpace: "nowrap",
    }}>
      {value?.replace(/_/g, " ")}
    </span>
  );
}
