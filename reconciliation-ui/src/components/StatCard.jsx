export default function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: `1px solid var(--border)`,
      borderLeft: `4px solid ${accent || "var(--primary)"}`,
      borderRadius: "var(--radius)",
      padding: "20px 24px",
      boxShadow: "var(--shadow)",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>
        {label}
      </span>
      <span style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
        {value ?? "—"}
      </span>
      {sub && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</span>}
    </div>
  );
}
