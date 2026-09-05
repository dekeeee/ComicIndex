/** PostgreSQL エラーコードの判定ヘルパ（supabase-js の PostgrestError 用）。 */

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

export interface PgErrorLike {
  code?: string | null;
  message: string;
}

export function isPgError(error: PgErrorLike | null, code: string): boolean {
  return error !== null && error.code === code;
}

export function isUniqueViolation(error: PgErrorLike | null): boolean {
  return isPgError(error, PG_UNIQUE_VIOLATION);
}

export function isForeignKeyViolation(error: PgErrorLike | null): boolean {
  return isPgError(error, PG_FOREIGN_KEY_VIOLATION);
}

/** repo 層で DB エラーを例外に変換するときの共通形。 */
export class DbError extends Error {
  constructor(operation: string, cause: PgErrorLike) {
    super(`${operation} failed: ${cause.message}`);
    this.name = "DbError";
  }
}
