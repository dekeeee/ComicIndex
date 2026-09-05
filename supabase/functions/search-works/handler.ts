import {
  SEARCH_DB_LIMIT,
  SEARCH_RAKUTEN_FALLBACK_THRESHOLD,
} from "../_shared/config.ts";
import { RakutenError } from "../_shared/rakuten.ts";
import {
  error,
  guarded,
  json,
  preflight,
  rateLimited,
  requireMethod,
} from "../_shared/response.ts";
import type {
  PostKind,
  RakutenCandidate,
  RateLimitResult,
  SearchResult,
  WorkSummary,
} from "../_shared/types.ts";
import { validateSearchQuery } from "../_shared/validation.ts";

export interface SearchRepo {
  /** `published` かつ非成人の作品をタイトル・かな・著者で部分一致検索する。 */
  searchPublished(q: string, limit: number): Promise<WorkSummary[]>;
}

export interface SearchWorksDeps {
  ipHash(req: Request): Promise<string>;
  checkRateLimit(kind: PostKind, ipHash: string): Promise<RateLimitResult>;
  repo: SearchRepo;
  searchRakuten(q: string): Promise<RakutenCandidate[]>;
  /** 省略時は config の値。テストで差し替え可能。 */
  fallbackThreshold?: number;
  dbLimit?: number;
}

/**
 * PostgREST の `or()` フィルタ値に安全に埋め込める形にする。
 * 区切り・引用に使われる文字（`,` `.` `(` `)` `"` `\` `{` `}` `%` `*`）は
 * ilike のワイルドカード `*` に置き換える（"Dr.スランプ" → "Dr*スランプ" でも一致する）。
 */
export function sanitizeQueryForFilter(q: string): string {
  return q
    .replace(/[,.()"\\{}%*]/g, "*")
    .replace(/\*+/g, "*")
    .replace(/^\*|\*$/g, "");
}

/** `works` に対する `.or()` 式（純粋関数）。空になった場合は null。 */
export function buildOrFilter(q: string): string | null {
  const s = sanitizeQueryForFilter(q);
  if (s === "") return null;
  return `title.ilike.*${s}*,title_kana.ilike.*${s}*,authors.cs.{${s}}`;
}

/** DB ヒットが閾値未満なら楽天にフォールバックする（純粋関数）。 */
export function needsRakuten(dbHits: number, threshold: number): boolean {
  return dbHits < threshold;
}

/**
 * GET ?q=
 * DB 検索 → 3 件未満なら rate limit（search）→ 楽天検索 → 両方返す
 * 200 { db, rakuten } / 400 / 429 / 502
 */
export function handle(req: Request, deps: SearchWorksDeps): Promise<Response> {
  return guarded(async () => {
    const pre = preflight(req);
    if (pre) return pre;
    const wrongMethod = requireMethod(req, "GET");
    if (wrongMethod) return wrongMethod;

    const url = new URL(req.url);
    const validation = validateSearchQuery(url.searchParams.get("q"));
    if (!validation.ok) {
      return json(400, {
        code: "validation_failed",
        message: "Invalid search query.",
        errors: validation.errors,
      });
    }
    const q = validation.value;

    const db = await deps.repo.searchPublished(q, deps.dbLimit ?? SEARCH_DB_LIMIT);

    const threshold = deps.fallbackThreshold ?? SEARCH_RAKUTEN_FALLBACK_THRESHOLD;
    if (!needsRakuten(db.length, threshold)) {
      const result: SearchResult = { db, rakuten: [] };
      return json(200, result);
    }

    const hash = await deps.ipHash(req);
    const limit = await deps.checkRateLimit("search", hash);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);

    let rakuten: RakutenCandidate[];
    try {
      rakuten = await deps.searchRakuten(q);
    } catch (err) {
      if (err instanceof RakutenError) {
        return error(502, "rakuten_unavailable", "Rakuten Books API is unavailable.");
      }
      throw err;
    }

    const result: SearchResult = { db, rakuten };
    return json(200, result);
  });
}
