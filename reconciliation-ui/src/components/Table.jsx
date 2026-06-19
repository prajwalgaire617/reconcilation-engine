export default function Table({ columns, rows, emptyText = "No records found." }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{
                padding: "10px 14px",
                textAlign: col.align || "left",
                fontWeight: 600,
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: ".5px",
                color: "var(--text-muted)",
                borderBottom: "2px solid var(--border)",
                whiteSpace: "nowrap",
                background: "var(--surface)",
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{
                textAlign: "center", padding: "32px 14px",
                color: "var(--text-muted)", fontStyle: "italic",
              }}>
                {emptyText}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "var(--surface)" : "#f8fafc" }}>
              {columns.map(col => (
                <td key={col.key} style={{
                  padding: "11px 14px",
                  borderBottom: "1px solid var(--border)",
                  textAlign: col.align || "left",
                  verticalAlign: "middle",
                  color: "var(--text)",
                }}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
