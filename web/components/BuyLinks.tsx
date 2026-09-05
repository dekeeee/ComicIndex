import { demoEnabled } from "@/lib/demo";
import type { BuyLink } from "@/lib/types";

const STYLE: Record<BuyLink["store"], string> = {
  rakuten: "bg-[#bf0000] text-white hover:opacity-90",
  amazon: "bg-[#232f3e] text-white hover:opacity-90",
  ebook: "border border-border bg-surface hover:border-accent",
};

export function BuyLinks({ links }: { links: BuyLink[] }) {
  if (demoEnabled) return (
    <section aria-label="購入リンク" className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {(["rakuten", "amazon"] as const).map((store) => <button key={store} type="button" disabled className={`rounded px-4 py-2 text-sm font-semibold ${STYLE[store]}`}>{store === "rakuten" ? "楽天ブックスで見る" : "Amazonで見る"}（デモ）</button>)}
      </div>
      <p className="text-xs text-muted">購入ボタンの表示サンプルです。外部ストアには移動しません。</p>
    </section>
  );
  if (links.length === 0) return null;
  return (
    <section aria-label="購入リンク" className="flex flex-wrap gap-3">
      {links.map((link) => (
        <a
          key={`${link.store}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="nofollow sponsored noopener"
          className={`inline-flex items-center rounded px-4 py-2 text-sm font-semibold ${STYLE[link.store]}`}
        >
          {link.label}
        </a>
      ))}
    </section>
  );
}
