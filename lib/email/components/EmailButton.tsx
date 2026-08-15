import type { ReactNode } from "react";

type EmailButtonProps = {
  href: string;
  children: ReactNode;
};

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <a
      href={href}
      style={{
        backgroundColor: "#d8a24a",
        borderRadius: "12px",
        color: "#111111",
        display: "inline-block",
        fontSize: "15px",
        fontWeight: 700,
        padding: "13px 18px",
        textDecoration: "none"
      }}
    >
      {children}
    </a>
  );
}
