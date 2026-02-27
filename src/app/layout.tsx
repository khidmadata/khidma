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
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
