import type { ReactNode } from "react";

type EmailDetailsProps = {
  rows: Array<{
    label: string;
    value: ReactNode;
  }>;
};

export function EmailDetails({ rows }: EmailDetailsProps) {
  return (
    <table
      cellPadding="0"
      cellSpacing="0"
      role="presentation"
      style={{
        backgroundColor: "#111111",
        border: "1px solid #2f2a20",
        borderCollapse: "separate",
        borderRadius: "14px",
        margin: "22px 0 4px",
        overflow: "hidden",
        width: "100%"
      }}
    >
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.label}>
            <td
              style={{
                borderTop: index === 0 ? "0" : "1px solid #252119",
                color: "#a49d91",
                fontSize: "13px",
                lineHeight: "20px",
                padding: "12px 14px",
                width: "38%"
              }}
            >
              {row.label}
            </td>
            <td
              align="right"
              style={{
                borderTop: index === 0 ? "0" : "1px solid #252119",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 700,
                lineHeight: "20px",
                padding: "12px 14px"
              }}
            >
              {row.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
