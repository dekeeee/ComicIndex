/**
 * Edge Function 側の設定値集約。マジックナンバーはここに置く。
 * レート制限・バリデーション・シリーズ正規化の規則は `_shared/rules/*.json`（`/shared` からの同期コピー）を参照。
 */

/** 通報がこの件数に達したレビューは `status = 'hidden'` にする（F-10）。 */
export const REPORT_HIDE_THRESHOLD = 3;

/** `trigger-build` のデバウンス秒数。前回起動からこの秒数未満なら no-op（F-07 / F-13）。 */
export const BUILD_DEBOUNCE_SEC = 3600;

/** `search-works` の DB 検索最大件数。 */
export const SEARCH_DB_LIMIT = 20;

/** DB ヒットがこの件数未満なら楽天 API にフォールバックする（F-07）。 */
export const SEARCH_RAKUTEN_FALLBACK_THRESHOLD = 3;

/** 楽天ブックス書籍検索 API。 */
export const RAKUTEN_BOOKS_SEARCH_URL =
  "https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404";

/** 楽天ブックスの「コミック」ジャンル ID。 */
export const RAKUTEN_COMIC_GENRE_ID = "001001";

/** 楽天検索 1 回あたりの取得件数（フロントに返す候補数）。 */
export const RAKUTEN_SEARCH_HITS = 10;

/** `fetchRakutenItem` がタイトル検索で itemCode を突き合わせるときの取得件数。 */
export const RAKUTEN_LOOKUP_HITS = 30;

/**
 * Amazon アソシエイト商品リンク。紙書籍の ASIN = ISBN-10 なので API 無しで組める。
 * Python 側 `config.py`（AMAZON_DP_URL_TEMPLATE 等）と同じ値にすること。
 */
export const AMAZON_DP_URL_TEMPLATE = "https://www.amazon.co.jp/dp/{asin}?tag={tag}";
export const ISBN10_LENGTH = 10;
export const ISBN13_LENGTH = 13;
export const ISBN13_CONVERTIBLE_PREFIX = "978";

/** Cloudflare Turnstile の検証エンドポイント。 */
export const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** GitHub `repository_dispatch` の event_type。`.github/workflows/deploy.yml` 側と一致させる。 */
export const GITHUB_DISPATCH_EVENT_TYPE = "content-updated";

/** 作品 slug / シリーズキー。Python 側 `config.py`（SLUG_PREFIX 等）と同じ値にすること。 */
export const SLUG_PREFIX = "w-";
export const SLUG_HASH_LENGTH = 10;
export const SERIES_KEY_SEPARATOR = "|";

/** 単発登録（巻 1 件）の `series_confidence`。Python の `SERIES_CONFIDENCE_HIGH` と同じ。 */
export const SERIES_CONFIDENCE_SINGLE = 1.0;

/** 必須環境変数を読む。未設定なら例外（起動時に気付けるようにする）。 */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** 任意環境変数を読む。未設定・権限無しは undefined。 */
export function optionalEnv(name: string): string | undefined {
  try {
    const value = Deno.env.get(name);
    return value === "" ? undefined : value;
  } catch {
    return undefined;
  }
}
