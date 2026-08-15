import type { ReactNode } from "react";

type EmailLayoutProps = {
  preview?: string;
  title: string;
  children: ReactNode;
};

export function EmailLayout({ preview, title, children }: EmailLayoutProps) {
  return (
    <html lang="es">
      <head>
        <meta content="text/html; charset=UTF-8" httpEquiv="Content-Type" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        {preview && <title>{preview}</title>}
      </head>
      <body
        style={{
          backgroundColor: "#0f0f10",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          margin: 0,
          padding: "32px 16px"
        }}
      >
        <div
          style={{
            backgroundColor: "#1b1b1d",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "24px",
            margin: "0 auto",
            maxWidth: "560px",
            overflow: "hidden"
          }}
        >
          <div style={{ padding: "28px 28px 12px" }}>
            <p
              style={{
                color: "#d8a24a",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.18em",
                margin: "0 0 18px",
                textTransform: "uppercase"
              }}
            >
              BarberFlow
            </p>
            <h1
              style={{
                color: "#ffffff",
                fontSize: "26px",
                lineHeight: "32px",
                margin: "0 0 18px"
              }}
            >
              {title}
            </h1>
          </div>
          <div
            style={{
              backgroundColor: "#ffffff",
              padding: "28px"
            }}
          >
            {children}
          </div>
          <div style={{ padding: "18px 28px 26px" }}>
            <p
              style={{
                color: "rgba(255,255,255,0.48)",
                fontSize: "12px",
                lineHeight: "18px",
                margin: 0
              }}
            >
              Este correo se ha enviado desde BarberFlow. Si no esperabas este
              mensaje, puedes ignorarlo.
            </p>
          </div>
        </div>
      </body>
    </html>
  );
}
