import Link from "next/link";
import { demoEnabled } from "@/lib/demo";
import { config } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-12 text-sm text-muted">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <nav className="flex flex-wrap gap-4">
          <Link href="/about/">サイトについて</Link>
          <Link href="/terms/">利用規約</Link>
          <Link href="/privacy/">プライバシーポリシー</Link>
          <Link href="/contact/">お問い合わせ</Link>
        </nav>
        <p>{demoEnabled ? "ローカルデモでは購入・外部送信は行いません。作品とレビューは動作確認用のサンプルです。" : "当サイトは楽天アフィリエイトおよび各種アフィリエイトプログラムに参加しており、リンク経由の購入で紹介料を得ることがあります。"}</p>
        <p>© {config.siteName}</p>
      </div>
    </footer>
  );
}
