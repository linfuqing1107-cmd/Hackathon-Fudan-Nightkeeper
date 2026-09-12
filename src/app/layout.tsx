import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nightkeeper · 院外随访",
  description: "精神卫生院外随访 · 合成数据演示",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
