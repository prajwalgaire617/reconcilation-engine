const NAV = [
  { id: "dashboard", label: "Dashboard",        icon: "◈", sub: "Overview & metrics" },
  { id: "claims",    label: "Claims",            icon: "⊞", sub: "FHIR · PENDING · DONE · ERROR" },
  { id: "results",   label: "Reconciliation",    icon: "≡", sub: "All engine results" },
  { id: "failed",    label: "Errors & Retries",  icon: "⚠", sub: "Problem claims" },
  { id: "upload",    label: "Bank Statement",    icon: "↑", sub: "CSV / PDF import" },
  { id: "flow",      label: "System Flow",       icon: "⬡", sub: "Architecture & rules" },
];

export default function Sidebar({ active, onNav }) {
  return (
    <aside style={{
      width: 224,
      minHeight: "100vh",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "24px 20px 18px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 4 }}>
          OpenIMIS · SSF
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>
          Payment Reconciliation
        </div>
        <div style={{ marginTop: 5, fontSize: 11, color: "#334155" }}>
          Automated · Bank-of-Truth
        </div>
      </div>

      <div style={{ width: "100%", height: 1, background: "#1e293b" }} />

      {/* Status legend pills */}
      <div style={{ padding: "12px 16px 8px", display: "flex", flexWrap: "wrap", gap: 5 }}>
        {[
          { label: "DONE",    color: "#16a34a", bg: "#14532d" },
          { label: "PENDING", color: "#fbbf24", bg: "#451a03" },
          { label: "ERROR",   color: "#f87171", bg: "#450a0a" },
        ].map(s => (
          <span key={s.label} style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 12,
            color: s.color, background: s.bg, letterSpacing: ".4px",
          }}>
            {s.label}
          </span>
        ))}
      </div>

      <div style={{ width: "100%", height: 1, background: "#1e293b", marginBottom: 4 }} />

      {/* Nav items */}
      <nav style={{ padding: "8px 10px", flex: 1 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              width: "100%",
              padding: "9px 12px",
              border: "none",
              borderRadius: 8,
              background: active === item.id ? "#1e40af" : "transparent",
              color: active === item.id ? "#ffffff" : "#94a3b8",
              fontWeight: active === item.id ? 600 : 400,
              fontSize: 13,
              textAlign: "left",
              marginBottom: 2,
              transition: "background .12s, color .12s",
              cursor: "pointer",
            }}
            onMouseEnter={e => { if (active !== item.id) e.currentTarget.style.background = "#1e293b"; }}
            onMouseLeave={e => { if (active !== item.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 14, opacity: .85, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div>{item.label}</div>
              <div style={{ fontSize: 10, opacity: .55, marginTop: 1, fontWeight: 400 }}>{item.sub}</div>
            </div>
          </button>
        ))}
      </nav>

      <div style={{ padding: "14px 18px", fontSize: 10, color: "#1e293b", borderTop: "1px solid #1e293b", background: "#0c1422" }}>
        <div style={{ color: "#334155" }}>Django · localhost:8000</div>
        <div style={{ color: "#1e293b", marginTop: 2 }}>React · localhost:3000</div>
      </div>
    </aside>
  );
}
