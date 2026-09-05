// `_shared/rules/*.json` は /shared の同期コピー。編集は /shared 側で行い `npm run sync-shared` で反映する。
import rules from "./rules/validation-rules.json" with { type: "json" };
import type {
  Rating,
  ReportReason,
  ReviewInput,
  ValidationResult,
} from "./types.ts";

export const reviewRules = rules.review;
export const reportRules = rules.report;
export const searchRules = rules.search;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** 文字数はコードポイント単位（絵文字・サロゲートペアを 1 文字と数える）。フロントと同じ規則。 */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/** 検証済み・正規化済みのレビュー入力。 */
export interface NormalizedReviewInput {
  workId: string;
  nickname: string;
  body: string;
  rating: Rating;
  hasSpoiler: boolean;
}

export type ReviewValidation =
  | { ok: true; value: NormalizedReviewInput }
  | { ok: false; errors: Record<string, string> };

/** ニックネーム。空白のみ・未指定は既定名（「名無し」）。 */
export function normalizeNickname(value: unknown): string {
  if (typeof value !== "string") return reviewRules.defaultNickname;
  const trimmed = value.trim();
  return trimmed === "" ? reviewRules.defaultNickname : trimmed;
}

export function validateNickname(value: unknown): ValidationResult {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== "string") {
    return { ok: false, errors: { nickname: "must be a string" } };
  }
  if (codePointLength(value.trim()) > reviewRules.nicknameMax) {
    return {
      ok: false,
      errors: { nickname: `must be at most ${reviewRules.nicknameMax} characters` },
    };
  }
  return { ok: true };
}

/**
 * レビュー入力の検証（`validation-rules.json` の規則）。
 * 引数は JSON デコード直後の値でよい（unknown）。通過時は正規化済み値を返す。
 */
export function validateReviewInput(input: unknown): ReviewValidation {
  const errors: Record<string, string> = {};
  const raw = (typeof input === "object" && input !== null
    ? input
    : {}) as Partial<Record<keyof ReviewInput, unknown>>;

  if (!isUuid(raw.workId)) errors["workId"] = "must be a uuid";

  const nicknameResult = validateNickname(raw.nickname);
  if (!nicknameResult.ok) Object.assign(errors, nicknameResult.errors);

  let body = "";
  if (typeof raw.body !== "string") {
    errors["body"] = "must be a string";
  } else {
    body = raw.body.trim();
    const length = codePointLength(body);
    if (length < reviewRules.bodyMin || length > reviewRules.bodyMax) {
      errors["body"] =
        `must be ${reviewRules.bodyMin} to ${reviewRules.bodyMax} characters`;
    }
  }

  const rating = raw.rating;
  if (
    typeof rating !== "number" || !Number.isInteger(rating) ||
    rating < reviewRules.ratingMin || rating > reviewRules.ratingMax
  ) {
    errors["rating"] =
      `must be an integer from ${reviewRules.ratingMin} to ${reviewRules.ratingMax}`;
  }

  if (typeof raw.hasSpoiler !== "boolean") {
    errors["hasSpoiler"] = "must be a boolean";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      workId: raw.workId as string,
      nickname: normalizeNickname(raw.nickname),
      body,
      rating: rating as Rating,
      hasSpoiler: raw.hasSpoiler as boolean,
    },
  };
}

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" &&
    (reportRules.reasons as readonly string[]).includes(value);
}

export type QueryValidation =
  | { ok: true; value: string }
  | { ok: false; errors: Record<string, string> };

/** 検索クエリ。trim 後の長さを `search.queryMin`〜`queryMax` で検証する。 */
export function validateSearchQuery(value: unknown): QueryValidation {
  if (typeof value !== "string") {
    return { ok: false, errors: { q: "is required" } };
  }
  const q = value.trim();
  const length = codePointLength(q);
  if (length < searchRules.queryMin || length > searchRules.queryMax) {
    return {
      ok: false,
      errors: {
        q: `must be ${searchRules.queryMin} to ${searchRules.queryMax} characters`,
      },
    };
  }
  return { ok: true, value: q };
}
