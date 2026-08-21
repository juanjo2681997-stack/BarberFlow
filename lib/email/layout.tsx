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
        <style>
          {`
            @media only screen and (max-width: 620px) {
              .bf-outer { padding: 24px 12px !important; }
              .bf-shell { width: 100% !important; }
              .bf-card { padding: 28px 20px !important; }
              .bf-title { font-size: 25px !important; line-height: 32px !important; }
              .bf-button { display: block !important; text-align: center !important; }
            }
          `}
        </style>
      </head>
      <body
        style={{
          backgroundColor: "#080809",
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          margin: 0,
          padding: 0
        }}
      >
        {preview && (
          <div
            style={{
              color: "transparent",
              display: "none",
              height: 0,
              maxHeight: 0,
              maxWidth: 0,
              opacity: 0,
              overflow: "hidden"
            }}
          >
            {preview}
          </div>
        )}
        <table
          cellPadding="0"
          cellSpacing="0"
          role="presentation"
          style={{
            backgroundColor: "#080809",
            borderCollapse: "collapse",
            width: "100%"
          }}
        >
          <tbody>
            <tr>
              <td
                align="center"
                className="bf-outer"
                style={{ padding: "40px 16px" }}
              >
                <table
                  cellPadding="0"
                  cellSpacing="0"
                  className="bf-shell"
                  role="presentation"
                  style={{
                    borderCollapse: "collapse",
                    maxWidth: "600px",
                    width: "100%"
                  }}
                >
                  <tbody>
                    <tr>
                      <td align="center" style={{ padding: "0 0 22px" }}>
                        <div
                          style={{
                            color: "#d8a24a",
                            fontSize: "26px",
                            fontWeight: 800,
                            letterSpacing: "0.02em",
                            lineHeight: "32px"
                          }}
                        >
                          flowbarber
                        </div>
                        <div
                          style={{
                            color: "#8c877d",
                            fontSize: "12px",
                            fontWeight: 700,
                            letterSpacing: "0.16em",
                            lineHeight: "18px",
                            marginTop: "6px",
                            textTransform: "uppercase"
                          }}
                        >
                          Gestión profesional de barberías
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td
                        className="bf-card"
                        style={{
                          backgroundColor: "#171717",
                          border: "1px solid #2d271d",
                          borderRadius: "22px",
                          padding: "36px 34px"
                        }}
                      >
                        <div
                          style={{
                            backgroundColor: "#d8a24a",
                            borderRadius: "999px",
                            height: "3px",
                            margin: "0 0 26px",
                            width: "64px"
                          }}
                        />
                        <h1
                          className="bf-title"
                          style={{
                            color: "#ffffff",
                            fontSize: "30px",
                            fontWeight: 800,
                            letterSpacing: 0,
                            lineHeight: "38px",
                            margin: "0 0 22px"
                          }}
                        >
                          {title}
                        </h1>
                        {children}
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style={{ padding: "22px 20px 0" }}>
                        <p
                          style={{
                            color: "#777269",
                            fontSize: "12px",
                            lineHeight: "19px",
                            margin: 0
                          }}
                        >
                          flowbarber
                          <br />
                          Correo enviado automáticamente. Si no esperabas este
                          mensaje, puedes ignorarlo.
                        </p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
