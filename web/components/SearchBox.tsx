"use client";

import { useEffect, useState } from "react";
import { demoEnabled } from "@/lib/demo";
import { config } from "@/lib/config";

export function SearchBox({ onSearch, initial = "" }: { onSearch: (q: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const q = value.trim();
    if (!q && !demoEnabled) return;
    const handle = setTimeout(() => onSearch(q), config.searchDebounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim() || demoEnabled) onSearch(value.trim());
      }}
      className="search-shell flex gap-2"
    >
      <input
        type="search"
        aria-label="作品名・作者名で検索"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="作品名・作者名で検索"
        autoFocus
        className="min-w-0 flex-1 rounded border border-border bg-surface px-3 py-2 text-base outline-none"
      />
      <button type="submit" className="rounded bg-accent px-5 py-2 text-sm font-semibold text-white">
        検索
      </button>
    </form>
  );
}
