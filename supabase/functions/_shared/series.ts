// `_shared/rules/*.json` は /shared の同期コピー。編集は /shared 側で行い `npm run sync-shared` で反映する。
import rules from "./rules/series-rules.json" with { type: "json" };
import { SERIES_KEY_SEPARATOR, SLUG_HASH_LENGTH, SLUG_PREFIX } from "./config.ts";

/**
 * 巻タイトル → シリーズの正規化。Python 側 `pipeline/comicomi_pipeline/series_grouper.py` と
 * 同じ規則（`shared/series-rules.json`）・同じ処理順で、同じ `rakuten_series_key` / slug を出す。
 *
 * 処理順（Python と一致させること）:
 *   1. strip_decorations: `strip_patterns` を生タイトルから除去（置換は空文字）
 *   2. strip_volume: `volume_patterns` を先頭から試し、最初に一致した位置より前を残す
 *   3. finish: NFKC → 連続空白を 1 つに → trim →（キー用のみ）ASCII 小文字化
 *
 * Python の `\d` は Unicode 数字（全角含む）に一致するので、JS 側は `\p{Nd}` に置き換えて揃える。
 *
 *   normalizeTitle(title) = finish(strip_decorations(title), lowercase)   … 比較用（巻数は残す）
 *   seriesTitle(title)    = finish(strip_volume(title), keep case)        … 表示用（works.title）
 *   seriesKey(title, author) = finish(strip_volume(title), lowercase) + "|" + normalizeAuthor(主著者)
 *   slugFor(key) = "w-" + sha1(key) の先頭 10 桁
 */

function toUnicodeDigits(pattern: string): string {
  return pattern.replace(/\\d/g, "\\p{Nd}");
}

const volumePatterns: RegExp[] = rules.volume_patterns.map((p) =>
  new RegExp(toUnicodeDigits(p), "u")
);
const stripPatterns: RegExp[] = rules.strip_patterns.map((p) =>
  new RegExp(toUnicodeDigits(p), "gu")
);

/** Python `config.AUTHOR_SEPARATOR_PATTERN` と同じ。 */
const AUTHOR_SEPARATOR = /[\/／、,，]/u;

function lowercaseAscii(text: string): string {
  return text.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

/** 仕上げ: NFKC → 空白圧縮 → trim →（必要なら）ASCII 小文字化。 */
function finish(text: string, lowercase: boolean): string {
  let out = text;
  if (rules.normalize.fullwidth_to_halfwidth) out = out.normalize("NFKC");
  if (rules.normalize.collapse_spaces) out = out.replace(/\s+/gu, " ");
  if (rules.normalize.trim) out = out.trim();
  if (lowercase && rules.normalize.lowercase_ascii) out = lowercaseAscii(out);
  return out;
}

/** 【電子版】/（完）/ 版種表記などを除去する（未正規化のまま）。 */
export function stripDecorations(title: string): string {
  let out = title;
  for (const re of stripPatterns) out = out.replace(re, "");
  return out;
}

function matchVolume(base: string): RegExpExecArray | null {
  for (const re of volumePatterns) {
    const m = re.exec(base);
    if (m !== null) return m;
  }
  return null;
}

/** 装飾と末尾の巻数を除いたタイトル（未正規化のまま）。 */
export function stripVolume(title: string): string {
  const base = stripDecorations(title);
  const m = matchVolume(base);
  return m === null ? base : base.slice(0, m.index);
}

/** 巻数を取り出す。無ければ null。 */
export function extractVolume(title: string): number | null {
  const m = matchVolume(stripDecorations(title));
  const digits = m?.[1];
  if (digits === undefined) return null;
  const n = Number.parseInt(digits.normalize("NFKC"), 10);
  return Number.isNaN(n) ? null : n;
}

/** 比較用の正規化（巻数は残す。Python `normalize_title` と同じ）。 */
export function normalizeTitle(title: string): string {
  return finish(stripDecorations(title), true);
}

/** 表示用のシリーズ名（巻数除去・大文字小文字は保持。Python `series_title` と同じ）。 */
export function seriesTitle(title: string): string {
  return finish(stripVolume(title), false);
}

/** 楽天の `author`（「A/B」形式）を表示名の配列に分割する（大文字小文字は保持）。 */
export function splitAuthors(author: string): string[] {
  return author
    .split(AUTHOR_SEPARATOR)
    .map((part) => finish(part, false))
    .filter((name) => name !== "");
}

/** 著者名のキー用正規化。 */
export function normalizeAuthor(name: string): string {
  return finish(name, true);
}

/** 正規化タイトル（巻数除去）+ 主著者からなる安定キー。 */
export function seriesKey(title: string, author: string): string {
  const titlePart = finish(stripVolume(title), true);
  const primary = splitAuthors(author)[0];
  const authorPart = primary === undefined ? "" : normalizeAuthor(primary);
  return `${titlePart}${SERIES_KEY_SEPARATOR}${authorPart}`;
}

async function sha1Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** `w-` + sha1(seriesKey) 先頭 10 桁（Python `make_slug` と同じ）。 */
export async function slugFor(key: string): Promise<string> {
  const hex = await sha1Hex(key);
  return `${SLUG_PREFIX}${hex.slice(0, SLUG_HASH_LENGTH)}`;
}
