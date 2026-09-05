"use client";

import { demoEnabled } from "@/lib/demo";
import { WorkCard } from "@/components/WorkCard";
import type { SearchResult } from "@/lib/types";

export function SearchResults({
  result,
  onRegister,
  registering,
}: {
  result: SearchResult;
  onRegister: (itemCode: string, title: string) => void;
  registering: string | null;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="section-title mb-3">登録済みの作品</h2>
        {result.db.length === 0 ? (
          <p className="text-sm text-muted">見つかりませんでした。</p>
        ) : (
          <div className="books-grid grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {result.db.map((w) => (
              <WorkCard key={w.id} work={w} />
            ))}
          </div>
        )}
      </section>
      {result.rakuten.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold mb-1">{demoEnabled ? "追加を試せるデモ作品" : "楽天ブックスから登録する"}</h2>
          <p className="text-xs text-muted mb-3">まだ登録されていない作品です。登録するとレビューを書けるようになります。</p>
          <ul className="divide-y divide-border rounded border border-border bg-surface">
            {result.rakuten.map((c) => (
              <li key={c.itemCode} className="flex items-center gap-4 p-4 sm:p-5 text-sm">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt="" width={40} height={60} loading="lazy" className="h-15 w-10 object-cover rounded" />
                ) : (
                  <div className="h-15 w-10 rounded bg-surface-soft border border-border" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{c.title}</p>
                  <p className="text-xs text-muted truncate">
                    {c.author} {c.salesDate}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={registering !== null}
                  onClick={() => onRegister(c.itemCode, c.title)}
                  className="shrink-0 rounded border border-border px-5 py-2 font-semibold hover:border-accent hover:text-accent disabled:opacity-50"
                >
                  {registering === c.itemCode ? "登録中…" : "登録"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
