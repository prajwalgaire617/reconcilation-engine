const STYLES = {
  MATCHED:                { color: "var(--green)",  bg: "var(--green-bg)" },
  SETTLEMENT_PENDING:     { color: "var(--yellow)", bg: "var(--yellow-bg)" },
  STATUS_MISMATCH:        { color: "var(--red)",    bg: "var(--red-bg)" },
  INVESTIGATION_REQUIRED: { color: "var(--orange)", bg: "var(--orange-bg)" },
  AMOUNT_MISMATCH:        { color: "var(--purple)", bg: "var(--purple-bg)" },
  NOT_SENT:               { color: "var(--gray)",   bg: "var(--gray-bg)" },
  SUCCESS:                { color: "var(--green)",  bg: "var(--green-bg)" },
  FAILED:                 { color: "var(--red)",    bg: "var(--red-bg)" },
  PENDING:                { color: "var(--yellow)", bg: "var(--yellow-bg)" },
  SUBMITTED:              { color: "var(--blue)",   bg: "var(--blue-bg)" },
};

export default function Badge({ value }) {
  const s = STYLES[value] || { color: "var(--gray)", bg: "var(--gray-bg)" };
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      letterSpacing: ".3px",
      color: s.color,
      background: s.bg,
      whiteSpace: "nowrap",
    }}>
      {value?.replace(/_/g, " ")}
    </span>
  );
}
