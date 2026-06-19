import { NavLink } from "react-router-dom";

const NAV = [
  {
    group: "Operations",
    items: [
      { to: "/",           label: "Operations Center",        icon: "⬡", exact: true },
      { to: "/workbench",  label: "Reconciliation Workbench", icon: "⊞" },
      { to: "/exceptions", label: "Exception Management",     icon: "⚠" },
    ],
  },
  {
    group: "Payments",
    items: [
      { to: "/failed",   label: "Failed Payments",  icon: "✗" },
      { to: "/retry",    label: "Retry Management", icon: "↻" },
      { to: "/batches",  label: "Payment Batches",  icon: "▤" },
      { to: "/queue",    label: "Payment Queue",    icon: "≡" },
    ],
  },
  {
    group: "Data",
    items: [
      { to: "/claims",     label: "Claims",           icon: "◈" },
      { to: "/statements", label: "Bank Statements",  icon: "⊟" },
    ],
  },
  {
    group: "Reports",
    items: [
      { to: "/reports", label: "Reports", icon: "↗" },
    ],
  },
];

export default function Sidebar() {
  return (
    <aside style={{
      width: "var(--sidebar-width)",
      minWidth: "var(--sidebar-width)",
      background: "var(--nav-bg)",
      borderRight: "1px solid var(--nav-border)",
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      position: "sticky",
      top: 0,
      overflowY: "auto",
      flexShrink: 0,
    }}>
      {/* Product header */}
      <div style={{
        padding: "18px 16px 14px",
        borderBottom: "1px solid var(--nav-border)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".9px", color: "#52525b", textTransform: "uppercase", marginBottom: 3 }}>
          NHIF Nepal
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#e4e4e7", letterSpacing: "-.01em", lineHeight: 1.3 }}>
          Payment Reconciliation
        </div>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          marginTop: 9, padding: "3px 8px",
          background: "rgba(34,197,94,.1)",
          border: "1px solid rgba(34,197,94,.2)",
          borderRadius: 3,
          fontSize: 9, fontWeight: 700, color: "#4ade80", letterSpacing: ".5px", textTransform: "uppercase",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ade80" }} />
          Live
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, padding: "14px 12px", overflowY: "auto" }}>
        {NAV.map((group) => (
          <div key={group.group} style={{ marginBottom: 22 }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: "#3f3f46",
              padding: "0 4px",
              marginBottom: 5,
            }}>
              {group.group}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  style={({ isActive }) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 5,
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "#ffffff" : "#a1a1aa",
                    background: isActive ? "rgba(59,130,246,.18)" : "transparent",
                    borderLeft: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                    transition: "background .1s, color .1s",
                  })}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.style.background.includes("rgba(59")) {
                      e.currentTarget.style.background = "var(--nav-hover)";
                      e.currentTarget.style.color = "#d4d4d8";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.style.background.includes("rgba(59")) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "#a1a1aa";
                    }
                  }}
                >
                  <span style={{ fontSize: 13, opacity: .75, width: 16, textAlign: "center", flexShrink: 0 }}>
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer status */}
      <div style={{
        padding: "12px 14px",
        borderTop: "1px solid var(--nav-border)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, color: "#52525b", lineHeight: 2 }}>
          <div style={{ fontWeight: 600, color: "#71717a", marginBottom: 2, fontSize: 9, letterSpacing: ".5px", textTransform: "uppercase" }}>
            Gateway Status
          </div>
          <div>NCHL &nbsp;<span style={{ color: "#4ade80" }}>●</span> Online</div>
          <div>SOSYS &nbsp;<span style={{ color: "#4ade80" }}>●</span> Online</div>
          <div style={{ marginTop: 8, color: "#3f3f46", fontSize: 9 }}>v1.11.0 · hackathon build</div>
        </div>
      </div>
    </aside>
  );
}
