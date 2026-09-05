"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { SearchBox } from "@/components/SearchBox";
import { SearchResults } from "@/components/SearchResults";
import { registerWork, searchWorks } from "@/lib/api/search";
import type { SearchResult } from "@/lib/types";

export function SearchPageClient() {
  const requestId = useRef(0);
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [result, setResult] = useState<SearchResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);

  async function onSearch(q: string) {
    const current = ++requestId.current;
    setBusy(true);
    setMessage("");
    const res = await searchWorks(q);
    if (current !== requestId.current) return;
    setBusy(false);
    if (!res.ok) {
      setResult(null);
      setMessage(res.status === 429 ? "検索が多すぎます。少し待ってください。" : res.message);
      return;
    }
    setResult(res.data);
  }

  async function onRegister(itemCode: string, title: string) {
    setRegistering(itemCode);
    const res = await registerWork(itemCode, title);
    setRegistering(null);
    if (!res.ok) {
      setMessage(res.status === 429 ? "登録が多すぎます。少し待ってください。" : res.message);
      return;
    }
    const work = res.data.work;
    router.push(work.status === "published" ? `/works/${work.slug}/` : `/works/pending/?id=${work.id}`);
  }

  return (
    <div className="space-y-6">
      <SearchBox onSearch={onSearch} initial={initial} />
      {busy ? <p className="text-sm text-muted">検索中…</p> : null}
      {message ? <p className="text-sm text-accent">{message}</p> : null}
      {result ? <SearchResults result={result} onRegister={onRegister} registering={registering} /> : null}
    </div>
  );
}
