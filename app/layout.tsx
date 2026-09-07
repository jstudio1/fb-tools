import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pagecraft — Facebook Workspace",
  description: "โพสต์รูปภาพ+ข้อความไปหลายเพจ Facebook พร้อมกัน",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
