import type { ReactNode } from "react";

type EmailButtonProps = {
  href: string;
  children: ReactNode;
};

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <a
      className="bf-button"
      href={href}
      style={{
        backgroundColor: "#d8a24a",
        border: "1px solid #e5b866",
        borderRadius: "10px",
        color: "#111111",
        display: "inline-block",
        fontSize: "15px",
        fontWeight: 800,
        lineHeight: "20px",
        marginTop: "8px",
        padding: "14px 22px",
        textDecoration: "none"
      }}
    >
      {children}
    </a>
  );
}
