import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kryphxx Assist",
  description: "A simple Telegram assistant powered by Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
