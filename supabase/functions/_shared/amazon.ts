import {
  AMAZON_DP_URL_TEMPLATE,
  ISBN10_LENGTH,
  ISBN13_CONVERTIBLE_PREFIX,
  ISBN13_LENGTH,
} from "./config.ts";

/**
 * ISBN から Amazon アソシエイトの商品リンクを組み立てる（F-01 / F-07）。
 *
 * 新規サイトは PA-API を使えないが、紙書籍の ASIN は ISBN-10 そのものなので
 * `https://www.amazon.co.jp/dp/<ISBN-10>?tag=<タグ>` が API 無しで成立する。
 * Kindle 版は ASIN が別なので対象外。Python 側 `amazon_link.py` と同じ規則。
 */

const ISBN10_WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2] as const;

/** ハイフン・空白を除き、ISBN-10 / ISBN-13 の形なら大文字で返す。それ以外は null。 */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = raw.replace(/[-\s]/g, "").toUpperCase();
  if (text.length === ISBN13_LENGTH && /^\d+$/.test(text)) return text;
  if (text.length === ISBN10_LENGTH && /^\d{9}[\dX]$/.test(text)) return text;
  return null;
}

/** 978 始まりの ISBN-13 を ISBN-10 に変換する。979 には ISBN-10 が無いので null。 */
export function isbn13ToIsbn10(isbn13: string): string | null {
  if (isbn13.length !== ISBN13_LENGTH || !isbn13.startsWith(ISBN13_CONVERTIBLE_PREFIX)) {
    return null;
  }
  const core = isbn13.slice(ISBN13_CONVERTIBLE_PREFIX.length, -1);
  let total = 0;
  for (let i = 0; i < ISBN10_WEIGHTS.length; i++) {
    total += (ISBN10_WEIGHTS[i] ?? 0) * Number(core[i]);
  }
  const check = (11 - (total % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

/** アフィリエイト商品 URL。タグ無し・ISBN 無し・変換不能なら null。 */
export function buildAmazonUrl(
  isbn: string | null | undefined,
  tag: string | null | undefined,
): string | null {
  if (!tag) return null;
  const normalized = normalizeIsbn(isbn);
  if (normalized === null) return null;
  const asin = normalized.length === ISBN10_LENGTH ? normalized : isbn13ToIsbn10(normalized);
  if (asin === null) return null;
  return AMAZON_DP_URL_TEMPLATE.replace("{asin}", asin).replace("{tag}", tag);
}
