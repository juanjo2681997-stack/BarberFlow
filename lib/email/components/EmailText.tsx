import type { ReactNode } from "react";

type EmailTextProps = {
  children: ReactNode;
  muted?: boolean;
};

export function EmailText({ children, muted = false }: EmailTextProps) {
  return (
    <p
      style={{
        color: muted ? "#6b7280" : "#2b2b2b",
        fontSize: "15px",
        lineHeight: "24px",
        margin: "0 0 16px"
      }}
    >
      {children}
    </p>
  );
}
