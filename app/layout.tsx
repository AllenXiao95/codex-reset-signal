import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reset Signal — @thsottiaux monitor",
  description:
    "An open-source X monitor that sends email or SMS alerts when @thsottiaux posts the word reset.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
