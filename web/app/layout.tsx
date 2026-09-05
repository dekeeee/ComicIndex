import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { DemoBanner } from "@/components/DemoBanner";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: {
    default: `${config.siteName} | 漫画のレビューと似ている漫画`,
    template: `%s | ${config.siteName}`,
  },
  description: "漫画のレビュー・口コミを読んで書いて、似ている漫画をたどって次の1冊を見つけるサイト。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <DemoBanner />
        <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-5 sm:py-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
