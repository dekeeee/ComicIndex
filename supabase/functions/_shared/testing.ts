import type { PostLogStore } from "./ratelimit.ts";
import type { PostKind, RateLimitResult } from "./types.ts";

/** テスト専用ヘルパ。本番コードから import しない。 */

interface LogEntry {
  kind: PostKind;
  ipHash: string;
  at: Date;
}

/** メモリ上の `post_log`。`now` を差し替えて時間を進められる。 */
export class FakePostLogStore implements PostLogStore {
  readonly entries: LogEntry[] = [];
  now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.now = now;
  }

  listRecent(
    kind: PostKind,
    ipHash: string,
    since: Date,
    limit: number,
  ): Promise<Date[]> {
    const dates = this.entries
      .filter((e) => e.kind === kind && e.ipHash === ipHash && e.at >= since)
      .map((e) => e.at)
      .sort((a, b) => b.getTime() - a.getTime())
      .slice(0, limit);
    return Promise.resolve(dates);
  }

  record(kind: PostKind, ipHash: string): Promise<void> {
    this.entries.push({ kind, ipHash, at: this.now() });
    return Promise.resolve();
  }
}

/** JSON 本文付きリクエスト。 */
export function jsonRequest(
  url: string,
  method: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 常に同じ ip_hash を返す fake。 */
export function fakeIpHash(hash = "iphash-test"): (req: Request) => Promise<string> {
  return () => Promise.resolve(hash);
}

/** 呼び出しを記録するレート制限 fake。 */
export function fakeRateLimit(result: RateLimitResult): {
  calls: PostKind[];
  check: (kind: PostKind, ipHash: string) => Promise<RateLimitResult>;
} {
  const calls: PostKind[] = [];
  return {
    calls,
    check: (kind) => {
      calls.push(kind);
      return Promise.resolve(result);
    },
  };
}

export const ALLOWED: RateLimitResult = { allowed: true };
export const EXCEEDED: RateLimitResult = { allowed: false, retryAfterSec: 120 };

export const UUID_A = "11111111-1111-4111-8111-111111111111";
export const UUID_B = "22222222-2222-4222-8222-222222222222";
export const UUID_C = "33333333-3333-4333-8333-333333333333";
