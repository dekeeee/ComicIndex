import {
  RAKUTEN_BOOKS_SEARCH_URL,
  RAKUTEN_COMIC_GENRE_ID,
  RAKUTEN_LOOKUP_HITS,
  RAKUTEN_SEARCH_HITS,
  requireEnv,
} from "./config.ts";
import type { RakutenCandidate } from "./types.ts";

/** 楽天ブックス書籍検索 API（Edge 用）。アプリ ID はここでしか使わず、ブラウザには出さない。 */

export interface RakutenOptions {
  /** 省略時は環境変数 `RAKUTEN_APP_ID`。 */
  appId?: string;
  /** 省略時は環境変数 `RAKUTEN_AFFILIATE_ID`。 */
  affiliateId?: string;
  /** テスト用に差し替え可能な fetch。 */
  fetchFn?: typeof fetch;
}

export class RakutenError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RakutenError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * formatVersion=2 の 1 アイテムを内部型に変換する。
 * `itemCode` と `title` が無いものは捨てる（null）。
 */
export function toCandidate(raw: unknown): RakutenCandidate | null {
  if (!isRecord(raw)) return null;
  const itemCode = str(raw["itemCode"]);
  const title = str(raw["title"]);
  if (itemCode === null || title === null) return null;

  const genreField = str(raw["booksGenreId"]) ?? "";
  const genreIds = genreField.split("/").filter((g) => g !== "");

  return {
    itemCode,
    title,
    titleKana: str(raw["titleKana"]),
    author: str(raw["author"]) ?? "",
    imageUrl: str(raw["largeImageUrl"]) ?? str(raw["mediumImageUrl"]) ?? "",
    salesDate: str(raw["salesDate"]) ?? "",
    isbn: str(raw["isbn"]),
    publisher: str(raw["publisherName"]),
    caption: str(raw["itemCaption"]),
    affiliateUrl: str(raw["affiliateUrl"]) ?? str(raw["itemUrl"]) ?? "",
    genreIds,
  };
}

/** 検索 URL を組み立てる（テスト可能にするため分離）。 */
export function buildSearchUrl(
  params: Record<string, string>,
  appId: string,
  affiliateId: string,
): string {
  const url = new URL(RAKUTEN_BOOKS_SEARCH_URL);
  url.searchParams.set("applicationId", appId);
  url.searchParams.set("affiliateId", affiliateId);
  url.searchParams.set("formatVersion", "2");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function callApi(
  params: Record<string, string>,
  options: RakutenOptions,
): Promise<RakutenCandidate[]> {
  const appId = options.appId ?? requireEnv("RAKUTEN_APP_ID");
  const affiliateId = options.affiliateId ?? requireEnv("RAKUTEN_AFFILIATE_ID");
  const fetchFn = options.fetchFn ?? fetch;

  const res = await fetchFn(buildSearchUrl(params, appId, affiliateId));
  if (!res.ok) {
    throw new RakutenError(res.status, `Rakuten Books API responded ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!isRecord(data) || !Array.isArray(data["Items"])) {
    throw new RakutenError(502, "Rakuten Books API returned an unexpected shape");
  }
  const items: unknown[] = data["Items"];
  return items
    .map(toCandidate)
    .filter((c): c is RakutenCandidate => c !== null);
}

/** タイトルでコミックジャンルを検索し、最大 `RAKUTEN_SEARCH_HITS` 件返す。 */
export function searchRakutenBooks(
  q: string,
  options: RakutenOptions = {},
): Promise<RakutenCandidate[]> {
  return callApi(
    {
      title: q,
      booksGenreId: RAKUTEN_COMIC_GENRE_ID,
      hits: String(RAKUTEN_SEARCH_HITS),
    },
    options,
  );
}

/** ハイフン除去後に ISBN-13（978/979 始まり 13 桁）または ISBN-10 に見えるか。 */
export function looksLikeIsbn(code: string): boolean {
  const digits = code.replace(/-/g, "");
  return /^97[89]\d{10}$/.test(digits) || /^\d{9}[\dX]$/i.test(digits);
}

/**
 * 1 アイテムを itemCode で取得する。
 *
 * 【制限】楽天ブックス書籍検索 API には itemCode 直接指定のパラメータが無い。
 * - itemCode が ISBN に見える場合（楽天ブックスの書籍は itemCode = ISBN-13 であることが多い）は
 *   `isbn` パラメータで検索し、itemCode / isbn が一致するものを返す。
 * - それ以外は `titleHint`（`search-works` の結果に含まれていたタイトル）でタイトル検索し、
 *   `itemCode` が一致するものを返す。ヒントが無ければ null。
 */
export async function fetchRakutenItem(
  itemCode: string,
  titleHint?: string,
  options: RakutenOptions = {},
): Promise<RakutenCandidate | null> {
  const digits = itemCode.replace(/-/g, "");

  if (looksLikeIsbn(itemCode)) {
    const items = await callApi({ isbn: digits }, options);
    const exact = items.find((item) =>
      item.itemCode === itemCode || item.isbn === digits
    );
    return exact ?? items[0] ?? null;
  }

  if (titleHint !== undefined && titleHint.trim() !== "") {
    const items = await callApi(
      {
        title: titleHint.trim(),
        booksGenreId: RAKUTEN_COMIC_GENRE_ID,
        hits: String(RAKUTEN_LOOKUP_HITS),
      },
      options,
    );
    return items.find((item) => item.itemCode === itemCode) ?? null;
  }

  return null;
}
