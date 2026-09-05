import { config } from "@/lib/config";
import type { ReviewInput, ValidationResult } from "@/lib/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Length in code points, so emoji and surrogate pairs count once (matches the Edge Function). */
export function charLength(value: string): number {
  return Array.from(value).length;
}

export function validateNickname(value: string | undefined): ValidationResult {
  const nickname = (value ?? "").trim();
  if (charLength(nickname) > config.nicknameMaxLength) {
    return { ok: false, errors: { nickname: `ニックネームは${config.nicknameMaxLength}文字以内です` } };
  }
  return { ok: true };
}

export function validateReviewInput(input: ReviewInput): ValidationResult {
  const errors: Record<string, string> = {};

  if (!UUID_RE.test(input.workId)) errors.workId = "作品IDが不正です";

  const body = input.body.trim();
  const len = charLength(body);
  if (len < config.reviewMinLength) errors.body = `本文は${config.reviewMinLength}文字以上で書いてください`;
  else if (len > config.reviewMaxLength) errors.body = `本文は${config.reviewMaxLength}文字以内です`;

  const nickname = validateNickname(input.nickname);
  if (!nickname.ok) Object.assign(errors, nickname.errors);

  if (!Number.isInteger(input.rating) || input.rating < config.ratingMin || input.rating > config.ratingMax) {
    errors.rating = "評価を選んでください";
  }

  if (typeof input.hasSpoiler !== "boolean") errors.hasSpoiler = "ネタバレ設定が不正です";

  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors };
}
