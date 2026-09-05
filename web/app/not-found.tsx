import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center space-y-4">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="text-sm text-muted">作品が登録されたばかりの場合、次回の更新でページが作られます。</p>
      <Link href="/search/" className="inline-block rounded bg-accent px-4 py-2 text-sm font-semibold text-white">
        作品を探す
      </Link>
    </div>
  );
}
