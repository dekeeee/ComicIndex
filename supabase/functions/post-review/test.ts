import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  ALLOWED,
  EXCEEDED,
  fakeIpHash,
  fakeRateLimit,
  jsonRequest,
  UUID_A,
  UUID_B,
  UUID_C,
} from "../_shared/testing.ts";
import type { ReviewRow } from "../_shared/types.ts";
import {
  decideReviewStatus,
  handle,
  type NewReviewRow,
  type PostReviewDeps,
  type ReviewRepo,
  type WorkGate,
} from "./handler.ts";

/**
 * 必須 3 ケース: 正常系 / Turnstile 失敗 / レート制限超過（CLAUDE.md テスト必須ルール）。
 * DB・Turnstile・post_log は全て fake を注入し、Supabase 無しで動く。
 */

const URL_ = "http://localhost/functions/v1/post-review";

interface Harness {
  deps: PostReviewDeps;
  inserted: NewReviewRow[];
  rateLimitCalls: string[];
}

function makeHarness(overrides: Partial<PostReviewDeps> = {}): Harness {
  const inserted: NewReviewRow[] = [];
  const gates = new Map<string, WorkGate>([
    [UUID_A, { status: "published", is_adult: false }],
    [UUID_B, { status: "published", is_adult: true }],
    [UUID_C, { status: "pending", is_adult: false }],
  ]);
  const repo: ReviewRepo = {
    findWorkGate: (id) => Promise.resolve(gates.get(id) ?? null),
    insertReview: (row) => {
      inserted.push(row);
      const stored: ReviewRow = {
        id: "99999999-9999-4999-8999-999999999999",
        work_id: row.work_id,
        nickname: row.nickname,
        body: row.body,
        rating: row.rating,
        has_spoiler: row.has_spoiler,
        status: row.status,
        created_at: "2026-09-03T00:00:00.000Z",
      };
      return Promise.resolve(stored);
    },
  };
  const rl = fakeRateLimit(ALLOWED);
  const deps: PostReviewDeps = {
    ipHash: fakeIpHash("hash-1"),
    clientIp: () => "203.0.113.1",
    verifyTurnstile: () => Promise.resolve(true),
    checkRateLimit: rl.check,
    repo,
    ...overrides,
  };
  return { deps, inserted, rateLimitCalls: rl.calls };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workId: UUID_A,
    body: "とても面白かったです。続きが気になります。",
    rating: 4,
    hasSpoiler: false,
    turnstileToken: "token",
    ...overrides,
  };
}

Deno.test("post-review: normal case stores a visible review and returns 201", async () => {
  const h = makeHarness();
  const res = await handle(jsonRequest(URL_, "POST", body({ nickname: " ねこ " })), h.deps);
  assertEquals(res.status, 201);
  const data = await res.json();
  assertEquals(data.review.status, "visible");
  assertEquals(data.review.nickname, "ねこ");
  assertEquals(data.review.workId, UUID_A);
  assertEquals(data.review.rating, 4);
  assertEquals(h.inserted.length, 1);
  assertEquals(h.inserted[0]?.ip_hash, "hash-1");
  assertEquals(h.rateLimitCalls, ["review"]);
  // 生 IP が保存行に無い
  assertFalse(JSON.stringify(h.inserted[0]).includes("203.0.113.1"));
});

Deno.test("post-review: Turnstile failure returns 403 and stores nothing", async () => {
  const h = makeHarness({ verifyTurnstile: () => Promise.resolve(false) });
  const res = await handle(jsonRequest(URL_, "POST", body()), h.deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).code, "turnstile_failed");
  assertEquals(h.inserted.length, 0);
  assertEquals(h.rateLimitCalls.length, 0);
});

Deno.test("post-review: rate limit exceeded returns 429 with Retry-After and stores nothing", async () => {
  const h = makeHarness({ checkRateLimit: fakeRateLimit(EXCEEDED).check });
  const res = await handle(jsonRequest(URL_, "POST", body()), h.deps);
  assertEquals(res.status, 429);
  assertEquals(res.headers.get("Retry-After"), "120");
  assertEquals(h.inserted.length, 0);
});

Deno.test("post-review: missing token is 400, invalid input is 400 with field errors", async () => {
  const h = makeHarness();
  const noToken = await handle(jsonRequest(URL_, "POST", body({ turnstileToken: "" })), h.deps);
  assertEquals(noToken.status, 400);

  const short = await handle(jsonRequest(URL_, "POST", body({ body: "短い" })), h.deps);
  assertEquals(short.status, 400);
  const data = await short.json();
  assertEquals(data.code, "validation_failed");
  assert("body" in data.errors);
  assertEquals(h.inserted.length, 0);
});

Deno.test("post-review: default nickname when omitted", async () => {
  const h = makeHarness();
  const res = await handle(jsonRequest(URL_, "POST", body()), h.deps);
  assertEquals(res.status, 201);
  assertEquals((await res.json()).review.nickname, "名無し");
});

Deno.test("post-review: NG word or 3+ URLs is stored as pending", async () => {
  const h = makeHarness();
  const ng = await handle(
    jsonRequest(URL_, "POST", body({ body: "作者は死ね。二度と読まない。本当に最悪の作品。" })),
    h.deps,
  );
  assertEquals(ng.status, 201);
  assertEquals((await ng.json()).review.status, "pending");

  const urls = await handle(
    jsonRequest(URL_, "POST", body({
      body: "https://a.example https://b.example https://c.example とても面白かった",
    })),
    h.deps,
  );
  assertEquals((await urls.json()).review.status, "pending");

  const twoUrls = await handle(
    jsonRequest(URL_, "POST", body({
      body: "https://a.example https://b.example とても面白かった作品でした",
    })),
    h.deps,
  );
  assertEquals((await twoUrls.json()).review.status, "visible");

  assertEquals(decideReviewStatus("普通の感想です。とても良い作品でした。"), "visible");
});

Deno.test("post-review: unknown, adult, or rejected work is 404; pending work is allowed", async () => {
  const h = makeHarness();
  const unknown = await handle(
    jsonRequest(URL_, "POST", body({ workId: "44444444-4444-4444-8444-444444444444" })),
    h.deps,
  );
  assertEquals(unknown.status, 404);
  const adult = await handle(jsonRequest(URL_, "POST", body({ workId: UUID_B })), h.deps);
  assertEquals(adult.status, 404);
  const pending = await handle(jsonRequest(URL_, "POST", body({ workId: UUID_C })), h.deps);
  assertEquals(pending.status, 201);
});

Deno.test("post-review: OPTIONS preflight is 204, GET is 405, bad JSON is 400", async () => {
  const h = makeHarness();
  assertEquals((await handle(new Request(URL_, { method: "OPTIONS" }), h.deps)).status, 204);
  assertEquals((await handle(new Request(URL_, { method: "GET" }), h.deps)).status, 405);
  const bad = new Request(URL_, { method: "POST", body: "{" });
  assertEquals((await handle(bad, h.deps)).status, 400);
});
