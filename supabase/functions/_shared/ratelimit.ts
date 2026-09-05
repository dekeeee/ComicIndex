// `_shared/rules/*.json` は /shared の同期コピー。編集は /shared 側で行い `npm run sync-shared` で反映する。
import limits from "./rules/rate-limits.json" with { type: "json" };
import type { PostKind, RateLimit, RateLimitResult } from "./types.ts";

/**
 * `post_log` への読み書きを抽象化する。実装は `postlog-store.ts`（supabase-js）。
 * テストでは fake を注入する。
 */
export interface PostLogStore {
  /** `since` 以降の `created_at` を新しい順に最大 `limit` 件返す。 */
  listRecent(
    kind: PostKind,
    ipHash: string,
    since: Date,
    limit: number,
  ): Promise<Date[]>;
  /** 通過した投稿を記録する。 */
  record(kind: PostKind, ipHash: string): Promise<void>;
}

export interface RateLimitDeps {
  store: PostLogStore;
  /** テスト用。省略時は現在時刻。 */
  now?: () => Date;
}

export interface WindowVerdict {
  exceeded: boolean;
  retryAfterSec: number;
}

/** 種別ごとの制限を `rate-limits.json` から返す。 */
export function limitsFor(kind: PostKind): RateLimit[] {
  return limits[kind];
}

/**
 * 1 ウィンドウ分の判定（純粋関数）。
 * `recentDesc` はウィンドウ内の投稿時刻を新しい順に並べたもの（`max` 件で打ち切ってよい）。
 * 件数が `max` 以上なら超過。新しい方から `max` 番目の投稿がウィンドウを抜けた時点で
 * 件数が `max - 1` に落ちるので、その時刻 + window を再試行可能時刻とする。
 */
export function evaluateWindow(
  limit: RateLimit,
  recentDesc: Date[],
  now: Date,
): WindowVerdict {
  if (recentDesc.length < limit.max) {
    return { exceeded: false, retryAfterSec: 0 };
  }
  const blocker = recentDesc[limit.max - 1] ?? recentDesc[recentDesc.length - 1];
  const retryAtMs = blocker === undefined
    ? now.getTime() + limit.windowSec * 1000
    : blocker.getTime() + limit.windowSec * 1000;
  const retryAfterSec = Math.max(1, Math.ceil((retryAtMs - now.getTime()) / 1000));
  return { exceeded: true, retryAfterSec };
}

/**
 * 全ウィンドウを判定し、どれか 1 つでも超過なら `{ allowed: false, retryAfterSec }`
 * （複数超過時は最も長い待ち時間）。全て通過なら `post_log` に記録して `{ allowed: true }`。
 */
export async function checkRateLimit(
  kind: PostKind,
  ipHash: string,
  limitList: RateLimit[],
  deps: RateLimitDeps,
): Promise<RateLimitResult> {
  const now = deps.now ? deps.now() : new Date();
  let worstRetry = 0;

  for (const limit of limitList) {
    const since = new Date(now.getTime() - limit.windowSec * 1000);
    const recent = await deps.store.listRecent(kind, ipHash, since, limit.max);
    const verdict = evaluateWindow(limit, recent, now);
    if (verdict.exceeded) worstRetry = Math.max(worstRetry, verdict.retryAfterSec);
  }

  if (worstRetry > 0) {
    return { allowed: false, retryAfterSec: worstRetry };
  }
  await deps.store.record(kind, ipHash);
  return { allowed: true };
}
