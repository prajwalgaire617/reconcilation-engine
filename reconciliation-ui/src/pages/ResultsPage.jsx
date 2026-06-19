import { useState } from "react";
import { getResults } from "../api/client";
import { useFetch } from "../hooks/useFetch";
import Table from "../components/Table";
import Badge from "../components/Badge";
import Spinner from "../components/Spinner";
import Pagination from "../components/Pagination";

const ALL_RESULTS = ["All", "MATCHED", "SETTLEMENT_PENDING", "STATUS_MISMATCH", "INVESTIGATION_REQUIRED", "AMOUNT_MISMATCH", "NOT_SENT"];

const fmt = (v) => v == null ? "—" : "NPR " + Number(v).toLocaleString("en-IN");

const COLUMNS = [
  { key: "claim_id",       label: "Claim ID",       align: "center" },
  { key: "result",         label: "Result",          render: (v) => <Badge value={v} /> },
  { key: "gateway_status", label: "Gateway Status",  render: (v) => v ? <Badge value={v} /> : <span style={{ color: "var(--text-muted)" }}>—</span> },
  { key: "bank_status",    label: "Bank Status",     render: (v) => v ? <Badge value={v} /> : <span style={{ color: "var(--text-muted)" }}>—</span> },
  { key: "gateway_amount", label: "Gateway Amt",     align: "right", render: fmt },
  { key: "bank_amount",    label: "Bank Amt",        align: "right", render: fmt },
  { key: "reason",         label: "Reason",          render: (v) => <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 12 }}>{v || "—"}</span> },
  { key: "created_at",     label: "Run At",          render: (v) => v ? new Date(v).toLocaleString() : "—" },
];

const PAGE_SIZE_DEFAULT = 20;

export default function ResultsPage() {
  const { data, loading, error } = useFetch(getResults);
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  const filtered = (data || []).filter(r => {
    if (filter !== "All" && r.result !== filter) return false;
    if (search && !String(r.claim_id).includes(search)) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleFilter(f) { setFilter(f); setPage(1); }
  function handleSearch(v) { setSearch(v); setPage(1); }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1200 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>All Reconciliation Results</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 24 }}>
        Every claim reconciled against SOSYS gateway log and bank statement.
      </p>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          type="text"
          placeholder="Search claim ID…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          style={{
            padding: "7px 12px", borderRadius: 7, border: "1px solid var(--border)",
            fontSize: 13, outline: "none", width: 160,
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ALL_RESULTS.map(r => (
            <button
              key={r}
              onClick={() => handleFilter(r)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: "1px solid var(--border)",
                background: filter === r ? "var(--primary)" : "var(--surface)",
                color: filter === r ? "#fff" : "var(--text-muted)",
                fontWeight: filter === r ? 600 : 400,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {r.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {loading && <Spinner />}
      {error && <p style={{ color: "var(--red)" }}>Error: {error}</p>}

      {data && (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {filtered.length} records{filter !== "All" ? ` matching ${filter.replace(/_/g," ")}` : ""}
            </span>
          </div>
          <Table columns={COLUMNS} rows={rows} emptyText="No records match this filter." />
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
          />
        </div>
      )}
    </div>
  );
}
