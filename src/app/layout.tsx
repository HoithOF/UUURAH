import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UUURAH",
  description: "Your whole business, live, in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
