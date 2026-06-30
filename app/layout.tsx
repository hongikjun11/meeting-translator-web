import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "실시간 회의 번역기",
  description: "차량용 반도체 팹리스 회사 회의 실시간 번역 서비스",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
