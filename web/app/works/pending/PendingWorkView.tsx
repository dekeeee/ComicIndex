"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { demoEnabled } from "@/lib/demo";
import { SimilarWorks } from "@/components/SimilarWorks";
import { BuyLinks } from "@/components/BuyLinks";
import { ReviewList } from "@/components/ReviewList";
import { WorkHeader } from "@/components/WorkHeader";
import { fetchPendingWork } from "@/lib/data/pending";
import type { PendingWork } from "@/lib/types";

const EPOCH = "1970-01-01T00:00:00.000Z";

export function PendingWorkView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [work, setWork] = useState<PendingWork | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    const load = id ? fetchPendingWork(id) : Promise.resolve(null);
    load
      .then((w) => {
        if (cancelled) return;
        setWork(w);
        setState(w ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state === "loading") return <p className="text-sm text-muted">読み込み中…</p>;
  if (state === "missing" || !work) {
    return (
      <p className="text-sm text-muted">
        作品が見つかりませんでした。すでにページが作られている場合は検索から辿れます。
      </p>
    );
  }

  return (
    <div className="space-y-10">
      <WorkHeader
        title={work.title}
        authors={work.authors}
        publisher={work.publisher}
        coverUrl={work.coverUrl}
        synopsis={work.synopsis}
        badge={demoEnabled ? "このブラウザに追加したデモ作品" : "登録したばかり・次回更新でページが作られます"}
      />
      <BuyLinks links={[{ store: "rakuten", label: "楽天ブックスで見る", url: work.affiliateUrlRakuten }]} />
      {/* Pending works have no static build, so every review is fetched live. */}
      {demoEnabled && <SimilarWorks items={[]} fromWorkId={work.id} />}
      <ReviewList key={work.id} workId={work.id} initialReviews={[]} builtAt={EPOCH} />
    </div>
  );
}
