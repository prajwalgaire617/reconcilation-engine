const NAV = [
  { id: "dashboard",  label: "Dashboard",       icon: "◈" },
  { id: "results",    label: "All Results",      icon: "≡" },
  { id: "failed",     label: "Problem Claims",   icon: "⚠" },
  { id: "upload",     label: "Upload Statement", icon: "↑" },
  { id: "flow",       label: "System Flow",      icon: "⬡" },
];

export default function Sidebar({ active, onNav }) {
  return (
    <aside style={{
      width: 220,
      minHeight: "100vh",
      background: "#0f172a",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      <div style={{ padding: "28px 20px 20px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 4 }}>
          OpenIMIS
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>
          SSF Reconciliation
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "#475569" }}>Payment Automation</div>
      </div>

      <div style={{ width: "100%", height: 1, background: "#1e293b" }} />

      <nav style={{ padding: "12px 10px", flex: 1 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => onNav(item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "10px 12px",
              border: "none",
              borderRadius: 8,
              background: active === item.id ? "#1e40af" : "transparent",
              color: active === item.id ? "#ffffff" : "#94a3b8",
              fontWeight: active === item.id ? 600 : 400,
              fontSize: 13.5,
              textAlign: "left",
              marginBottom: 2,
              transition: "background .15s, color .15s",
              cursor: "pointer",
            }}
            onMouseEnter={e => { if (active !== item.id) e.currentTarget.style.background = "#1e293b"; }}
            onMouseLeave={e => { if (active !== item.id) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 15, opacity: .8 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "16px 20px", fontSize: 11, color: "#334155", borderTop: "1px solid #1e293b" }}>
        API: localhost:8000
      </div>
    </aside>
  );
}
