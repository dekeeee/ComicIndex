/**
 * NG ワード・URL 数によるスパム判定（F-08）。
 * 該当しても投稿は拒否せず `status = 'pending'` で保持する前提なので、
 * リストは「明らかな暴言・勧誘・アダルト誘導」に絞り、作品の内容説明（戦う・殺し屋 等）を
 * 巻き込まないよう控えめにしている。網羅は目的にしない。
 */

const NG_WORDS: readonly string[] = [
  // 暴言（人に向けたもの）
  "死ね",
  "殺すぞ",
  "くたばれ",
  "キチガイ",
  "ガイジ",
  // 勧誘・スパム
  "出会い系",
  "援交",
  "セフレ",
  "裏垢",
  "副業で稼",
  "月収100万",
  "line交換",
  "lineを追加",
  "今すぐ登録",
  // アダルト誘導
  "無修正",
  "エロ動画",
  "アダルト動画",
  // 英語
  "porn",
  "viagra",
  "casino",
  "escort",
  "onlyfans",
  "crypto giveaway",
  "fuck you",
];

/** 比較用の正規化: NFKC → 小文字 → 空白除去（「死 ね」等の分割回避）。 */
export function normalizeForNg(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

const NORMALIZED_NG_WORDS: readonly string[] = NG_WORDS.map(normalizeForNg);

/** NG ワードを 1 つでも含めば true。 */
export function containsNgWord(text: string): boolean {
  const target = normalizeForNg(text);
  return NORMALIZED_NG_WORDS.some((word) => target.includes(word));
}

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/giu;

/** `http(s)://` または `www.` で始まる URL の個数。 */
export function countUrls(text: string): number {
  const normalized = text.normalize("NFKC");
  return (normalized.match(URL_PATTERN) ?? []).length;
}
