import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "ES-tensaku",
  description: "AI を活用したエントリーシート添削アシスタント"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>
        <div className="min-h-screen bg-gradient-to-br from-white via-slate-100 to-slate-200">
          {children}
        </div>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
