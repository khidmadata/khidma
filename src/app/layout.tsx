import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "./_components/BottomNav";

export const metadata: Metadata = {
  title: "خدمة — نظام إدارة الكفالات",
  description: "نظام رقمي لإدارة كفالات الأيتام والصدقات",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
      </head>
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
