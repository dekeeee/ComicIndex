import type { Metadata } from "next";
import { Suspense } from "react";
import { PendingWorkView } from "@/app/works/pending/PendingWorkView";

export const metadata: Metadata = {
  title: "登録したばかりの作品",
  robots: { index: false, follow: false },
};

/** Static shell; the work itself is fetched on the client from `?id=`. */
export default function PendingWorkPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">読み込み中…</p>}>
      <PendingWorkView />
    </Suspense>
  );
}
