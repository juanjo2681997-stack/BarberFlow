import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BarberFlow",
  description: "Miniapp movil para Pablo's Barbershop"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
