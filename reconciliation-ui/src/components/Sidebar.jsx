import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/dashboard", label: "Dashboard",       icon: "◈", sub: "Overview & live metrics" },
  { to: "/claims",    label: "Claims",           icon: "⊞", sub: "FHIR claims · filter & batch" },
  { to: "/batches",   label: "Batches",          icon: "📦", sub: "Hospital groups · auto-create" },
  { to: "/queue",     label: "Payment Queue",    icon: "⏱", sub: "FIFO · schedule · execute" },
  { to: "/results",   label: "Reconciliation",   icon: "≡", sub: "NCHL vs SOSYS results" },
  { to: "/errors",    label: "Errors & Retries", icon: "⚠", sub: "Problem claims · retry" },
  { to: "/upload",    label: "Bank Statement",   icon: "↑", sub: "CSV / PDF import" },
  { to: "/flow",      label: "System Flow",      icon: "⬡", sub: "Architecture & rules" },
];

export default function Sidebar() {
  return (
    <aside style={{
      width: 228, minHeight: "100vh", background: "#0f172a",
      display: "flex", flexDirection: "column", flexShrink: 0,
      borderRight: "1px solid #1e293b",
    }}>
      {/* Brand */}
      <div style={{ padding: "22px 20px 16px" }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "#334155", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 5 }}>
          OpenIMIS · SSF Nepal
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 }}>
          Payment Reconciliation
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[
            { label: "DONE",    color: "#4ade80", bg: "#14532d" },
            { label: "PENDING", color: "#fbbf24", bg: "#451a03" },
            { label: "ERROR",   color: "#f87171", bg: "#450a0a" },
          ].map(s => (
            <span key={s.label} style={{
              fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 10,
              color: s.color, background: s.bg, letterSpacing: ".5px",
            }}>{s.label}</span>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: "#1e293b", margin: "0 16px" }} />

      {/* Nav */}
      <nav style={{ padding: "10px 8px", flex: 1, overflowY: "auto" }}>
        {NAV.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/dashboard"}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              width: "100%",
              padding: "9px 12px",
              borderRadius: 8,
              background: isActive ? "#1e3a8a" : "transparent",
              color: isActive ? "#ffffff" : "#94a3b8",
              fontWeight: isActive ? 600 : 400,
              fontSize: 13,
              textDecoration: "none",
              marginBottom: 2,
              transition: "background .12s, color .12s",
              borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
            })}
            onMouseEnter={e => {
              if (!e.currentTarget.classList.contains("active"))
                e.currentTarget.style.background = "#1e293b";
            }}
            onMouseLeave={e => {
              if (!e.currentTarget.classList.contains("active"))
                e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 15, opacity: .85, marginTop: 1, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div>{item.label}</div>
              <div style={{ fontSize: 10, opacity: .5, marginTop: 1, fontWeight: 400 }}>{item.sub}</div>
            </div>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b", background: "#080f1a" }}>
        <div style={{ fontSize: 10, color: "#334155", lineHeight: 1.8 }}>
          <div>Django · :8000</div>
          <div>NCHL+SOSYS · :8001</div>
          <div>React · :5173</div>
        </div>
      </div>
    </aside>
  );
}
