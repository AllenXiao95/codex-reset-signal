import "./globals.css";

export const metadata = {
  title: "Reset Signal — @thsottiaux monitor",
  description:
    "An open-source X monitor that sends email or SMS alerts when @thsottiaux posts the word reset.",
  icons: {
    icon: "/favicon.svg",
  },
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
