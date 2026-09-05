"use client";

import Link from "next/link";
import { useState } from "react";
import { demoEnabled, demoStore } from "@/lib/demo";

export function DemoBanner() {
  const [message, setMessage] = useState("");
  if (!demoEnabled) return null;
  return (
    <aside className="border-b border-border bg-surface-soft px-5 sm:px-8 py-2 text-xs text-muted">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex-1 min-w-48 leading-relaxed"><strong>ローカルデモ</strong> — 架空の漫画で操作を試せます。投稿はこのブラウザだけに保存します。</p>
        <Link className="text-accent underline" href="/search/">検索・作品追加を試す</Link>
        <button className="rounded-full border border-border bg-white px-3 py-1" onClick={() => {
          if (!window.confirm("このデモで追加した作品・レビュー・投票・通報をすべてリセットしますか？")) return;
          try {
            demoStore().reset();
            // A full reload clears mounted review/form state after resetting storage.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/");
          }
          catch { setMessage("初期化できませんでした。ブラウザの保存設定を確認してください。"); }
        }}>デモをリセット</button>
        {message && <p role="alert">{message}</p>}
      </div>
    </aside>
  );
}
