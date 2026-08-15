import type { ReactNode } from "react";

type EmailTextProps = {
  children: ReactNode;
  muted?: boolean;
};

export function EmailText({ children, muted = false }: EmailTextProps) {
  return (
    <p
      style={{
        color: muted ? "#a49d91" : "#f3efe7",
        fontSize: "15px",
        lineHeight: "24px",
        margin: muted ? "18px 0 0" : "0 0 16px"
      }}
    >
      {children}
    </p>
  );
}
