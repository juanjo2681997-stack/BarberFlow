import type { Metadata } from "next";
import "./globals.css";
import NativeNotifications from "./NativeNotifications";

export const metadata: Metadata = {
  title: "flowbarber",
  description: "Miniapp movil para Pablo's Barbershop"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body><NativeNotifications />{children}</body>
    </html>
  );
}
