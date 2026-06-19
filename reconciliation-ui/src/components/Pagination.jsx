export default function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }) {
  if (totalPages <= 1 && total <= 10) return null;

  const pages = [];
  const delta = 2;
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
    pages.push(i);
  }

  const btnBase = {
    border: "1px solid var(--border)", background: "var(--surface)",
    borderRadius: 6, padding: "5px 10px", fontSize: 13, cursor: "pointer",
    color: "var(--text)", minWidth: 34, textAlign: "center",
  };
  const activeBtn = { ...btnBase, background: "var(--primary)", color: "#fff", borderColor: "var(--primary)", fontWeight: 700 };
  const disabledBtn = { ...btnBase, opacity: .4, cursor: "not-allowed" };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)", marginRight: 8 }}>
        {total} records
      </span>

      <button
        style={page === 1 ? disabledBtn : btnBase}
        onClick={() => onPageChange(1)}
        disabled={page === 1}
      >«</button>
      <button
        style={page === 1 ? disabledBtn : btnBase}
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
      >‹</button>

      {pages[0] > 1 && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>}
      {pages.map(p => (
        <button key={p} style={p === page ? activeBtn : btnBase} onClick={() => onPageChange(p)}>{p}</button>
      ))}
      {pages[pages.length - 1] < totalPages && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>}

      <button
        style={page === totalPages ? disabledBtn : btnBase}
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
      >›</button>
      <button
        style={page === totalPages ? disabledBtn : btnBase}
        onClick={() => onPageChange(totalPages)}
        disabled={page === totalPages}
      >»</button>

      {onPageSizeChange && (
        <select
          value={pageSize}
          onChange={e => onPageSizeChange(Number(e.target.value))}
          style={{ marginLeft: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12 }}
        >
          {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
        </select>
      )}
    </div>
  );
}
