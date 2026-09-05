"use client";

import { demoEnabled } from "@/lib/demo";
import { useState } from "react";
import { searchWorks } from "@/lib/api/search";
import { voteSimilar } from "@/lib/api/votes";
import type { WorkSummary } from "@/lib/types";

export function SuggestSimilarForm({ fromWorkId }: { fromWorkId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setMessage("");
    const result = await searchWorks(q);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setResults(result.data.db.filter((w) => w.id !== fromWorkId));
    if (result.data.db.length === 0) setMessage("登録済みの作品が見つかりませんでした。検索ページから登録できます。");
  }

  async function onVote(toWorkId: string) {
    const result = await voteSimilar(fromWorkId, toWorkId);
    setMessage(result.ok ? (demoEnabled ? "このブラウザに投票を保存しました。デモの類似順は固定です。" : "投票しました。次回の更新で反映されます。") : result.status === 409 ? "投票済みです" : result.message);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm text-accent underline">
        他に似ている作品を提案する
      </button>
    );
  }

  return (
    <div className="mt-3 rounded border border-border bg-surface p-3 text-sm">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="作品名で検索"
          className="flex-1 rounded border border-border bg-background px-2 py-1"
        />
        <button type="submit" disabled={busy} className="rounded bg-accent px-3 py-1 text-white disabled:opacity-50">
          検索
        </button>
      </form>
      {message ? <p className="mt-2 text-muted">{message}</p> : null}
      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-border">
          {results.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2 py-2">
              <span className="truncate">
                {w.title} <span className="text-muted">{w.authors.join("、")}</span>
              </span>
              <button type="button" onClick={() => onVote(w.id)} className="shrink-0 rounded border border-border px-2 py-0.5 hover:border-accent">
                似てる
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
