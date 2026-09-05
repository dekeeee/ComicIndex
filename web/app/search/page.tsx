import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchPageClient } from "@/app/search/SearchPageClient";

export const metadata: Metadata = {
  title: "作品を探す",
  description: "作品名・作者名で漫画を検索。見つからなければ楽天ブックスから登録できます。",
};

export default function SearchPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">作品を探す</h1>
      <Suspense fallback={null}>
        <SearchPageClient />
      </Suspense>
    </div>
  );
}
